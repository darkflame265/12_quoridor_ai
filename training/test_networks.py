import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
import torch
from networks import create_model,load_model,model_config,select_config
from train import ROOT,features,PolicyValue,parser,MCTS,Bridge,action_object,export_model
from learner import make_checkpoint,snapshot,run,evaluate_samples
from batch_selfplay import load_split_dataset

def state(y=8): return {'p':[{'x':4,'y':y},{'x':4,'y':0}],'walls':[],'left':[10,10],'turn':0,'winner':None}

class NetworkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): torch.set_num_threads(1)

    def test_spatial_planes_preserve_anchors_resources_and_player_rotation(self):
        model=create_model({'type':'rescnn','channels':8,'blocks':1})
        s=state(); s['walls']=[{'x':7,'y':7,'o':'h'},{'x':0,'y':0,'o':'v'}]; s['left']=[3,7]
        planes=model.encode(torch.from_numpy(features(s))[None,:]); self.assertEqual(tuple(planes.shape),(1,9,9,9))
        self.assertEqual(planes[0,0,8,4],1); self.assertEqual(planes[0,1,0,4],1); self.assertEqual(planes[0,2,7,7],1); self.assertEqual(planes[0,3,0,0],1)
        self.assertTrue(torch.all(planes[0,4]==.3)); self.assertTrue(torch.all(planes[0,5]==.7)); self.assertEqual(planes[0,6,7,7],1); self.assertEqual(planes[0,6,8,8],0); self.assertTrue(torch.all(planes[0,7,0]==1)); self.assertTrue(torch.all(planes[0,8,8]==1))
        rotated={**s,'p':[{'x':8-p['x'],'y':8-p['y']} for p in reversed(s['p'])],'left':s['left'][::-1],'turn':1,'walls':[{**w,'x':7-w['x'],'y':7-w['y']} for w in s['walls']]}
        np.testing.assert_array_equal(features(s),features(rotated))

    def test_policy_head_has_exact_81_64_64_action_layout(self):
        model=create_model({'type':'rescnn','channels':8,'blocks':1}).eval()
        with torch.no_grad(): model.policy_head.weight.zero_(); model.policy_head.bias.copy_(torch.tensor([1.,2.,3.])); logits,value=model(torch.from_numpy(features(state()))[None,:])
        self.assertEqual(tuple(logits.shape),(1,209)); self.assertEqual(tuple(value.shape),(1,)); self.assertTrue(torch.all(logits[:,:81]==1)); self.assertTrue(torch.all(logits[:,81:145]==2)); self.assertTrue(torch.all(logits[:,145:]==3)); self.assertLessEqual(abs(value.item()),1)

    def test_legacy_checkpoint_and_new_architecture_are_explicit(self):
        saved=torch.load(ROOT/'models/bootstrap-checkpoint.pt',map_location='cpu',weights_only=True); old=PolicyValue(saved['hidden']).eval(); old.load_state_dict(saved['model']); loaded=load_model(saved).eval(); x=torch.from_numpy(features(state()))[None,:]
        with torch.no_grad():
            for a,b in zip(old(x),loaded(x)): self.assertTrue(torch.equal(a,b))
        model=create_model({'type':'rescnn','channels':8,'blocks':1}).eval(); restored=load_model(snapshot(model,1)).eval()
        with torch.no_grad():
            for a,b in zip(model(x),restored(x)): self.assertTrue(torch.equal(a,b))
        with self.assertRaises(ValueError): create_model({'type':'unknown'})
        with self.assertRaises(ValueError): load_model({'format':'atlas-training-v2','hidden':128,'model':saved['model']})
        with self.assertRaises(ValueError): select_config(parser().parse_args(['--architecture','rescnn','--channels','0']))
        with tempfile.TemporaryDirectory() as temporary:
            file=Path(temporary)/'candidate.json'; export_model(model,file,{'productionActive':False}); self.assertEqual(json.loads(file.read_text())['format'],'atlas-policy-value-rescnn-v1')

    def test_residual_parameters_receive_gradients_and_fit_a_small_target(self):
        torch.manual_seed(83); model=create_model({'type':'rescnn','channels':8,'blocks':1}); optimizer=torch.optim.Adam(model.parameters(),lr=.003)
        samples=[]
        for i,y in enumerate([8,7,6,5]):
            pi=np.zeros(209,np.float32); pi[(y-1)*9+4]=1; samples.append((features(state(y)),pi,1. if i<2 else -1.))
        initial=evaluate_samples(model,samples)['loss']; before=model.stem[0].weight.detach().clone(); x=torch.tensor(np.stack([s[0] for s in samples])); pi=torch.tensor(np.stack([s[1] for s in samples])); z=torch.tensor([s[2] for s in samples]); model.train()
        for _ in range(30):
            optimizer.zero_grad(); logits,value=model(x); loss=-(pi*torch.log_softmax(logits,dim=-1)).sum(-1).mean()+((value-z)**2).mean(); loss.backward(); optimizer.step()
        self.assertLess(evaluate_samples(model,samples)['loss'],initial*.5); self.assertFalse(torch.equal(before,model.stem[0].weight))

    def test_validation_games_and_exact_features_do_not_leak_into_training(self):
        train,validation,metadata=load_split_dataset(ROOT/'reports/gpu-batch/dataset-smoke',.2,271027,5000)
        self.assertTrue(train and validation); self.assertFalse(set(metadata['trainGameIds'])&set(metadata['validationGameIds'])); self.assertEqual(len(metadata['trainGameIds'])+len(metadata['validationGameIds']),32); self.assertGreater(metadata['sharedPositionsExcluded'],0)
        self.assertFalse({x.tobytes() for x,_,_ in train}&{x.tobytes() for x,_,_ in validation})

    def test_cpu_iteration_resume_matches_continuous_training(self):
        previous=torch.are_deterministic_algorithms_enabled()
        fake={'wins':0,'losses':0,'draws':2,'games':[],'promotionEligible':False}
        try:
            with tempfile.TemporaryDirectory() as temporary,patch('learner.arena',side_effect=lambda *a,**k:copy.deepcopy(fake)),patch('learner.tactical_validation',return_value=[{'pass':True}]),patch('learner.export_model'):
                base=Path(temporary); torch.manual_seed(67); model=create_model({'type':'rescnn','channels':8,'blocks':1}); optimizer=torch.optim.Adam(model.parameters(),lr=.001,weight_decay=1e-4); replay=[]
                for y in [8,7,6,5]:
                    pi=np.zeros(209,np.float32); pi[(y-1)*9+4]=1; replay.append((features(state(y)),pi,1.))
                initial=make_checkpoint(model,optimizer,0,replay,[],np.random.default_rng(17),trainingSeed=17,deterministic=True,championSnapshot=snapshot(model,0),history=[snapshot(model,0)],registry={'active':None,'candidates':[]}); torch.save(initial,base/'initial.pt')
                def args(out,checkpoint,iterations): return parser().parse_args(['--resume',str(checkpoint),'--out',str(out),'--games','0','--iterations',str(iterations),'--epochs','1','--batch-size','2','--cpu','--seed','17','--threads','1','--deterministic'])
                run(args(base/'a',base/'initial.pt',2)); run(args(base/'b',base/'initial.pt',1)); run(args(base/'b',base/'b/checkpoint.pt',1))
                a=torch.load(base/'a/checkpoint.pt',weights_only=True); b=torch.load(base/'b/checkpoint.pt',weights_only=True)
                for key in a['model']: self.assertTrue(torch.equal(a['model'][key],b['model'][key]),key)
                self.assertTrue(torch.equal(a['torch_rng'],b['torch_rng'])); self.assertEqual(a['numpy_rng'],b['numpy_rng']); self.assertEqual(a['registry'],b['registry'])
        finally: torch.use_deterministic_algorithms(previous)

    @unittest.skipUnless(torch.cuda.is_available(),'CUDA not installed in this Python environment')
    def test_cnn_cpu_gpu_and_batch_predictions_agree(self):
        torch.manual_seed(91); cpu=create_model({'type':'rescnn','channels':16,'blocks':2}).eval(); gpu=copy.deepcopy(cpu).to('cuda').eval(); x=torch.tensor(np.stack([features(state(y)) for y in [8,7,6,5]])); tf32=torch.backends.cudnn.allow_tf32
        try:
            torch.backends.cudnn.allow_tf32=False
            with torch.inference_mode():
                for a,b in zip(cpu(x),gpu(x.cuda())): torch.testing.assert_close(a,b.cpu(),atol=1e-4,rtol=1e-4)
                for i in range(len(x)):
                    for a,b in zip(gpu(x[i:i+1].cuda()),gpu(x.cuda())): torch.testing.assert_close(a,b[i:i+1],atol=1e-4,rtol=1e-4)
        finally: torch.backends.cudnn.allow_tf32=tf32

if __name__=='__main__': unittest.main()
