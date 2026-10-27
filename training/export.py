"""Export a trusted local checkpoint, cross-language parity fixtures, and provenance."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import torch
from train import PolicyValue,Bridge,features,export_model
from networks import load_model,model_config
p=argparse.ArgumentParser();p.add_argument('--checkpoint',required=True);p.add_argument('--out',default='models');p.add_argument('--report');args=p.parse_args()
checkpoint=Path(args.checkpoint);saved=torch.load(checkpoint,map_location='cpu',weights_only=True);model=load_model(saved).eval();architecture=model_config(model);out=Path(args.out)
if architecture['type']!='mlp' and out.resolve()==(Path(__file__).resolve().parents[1]/'models').resolve(): raise ValueError('CNN export needs a separate --out directory; the live JS model supports MLP only')
out.mkdir(parents=True,exist_ok=True)
metadata={'iteration':saved['iteration'],'architecture':architecture,'validated':False,'productionActive':False,'note':'Experimental checkpoint export; does not activate a live model.'};export_model(model,out/'candidate.json',metadata)
bridge=Bridge(); fixtures=[]
try:
    for state in [bridge.call(op='initial')['state'],bridge.call(op='opening',index=2)['state']]:
        info=bridge.inspect(state)
        with torch.no_grad(): logits,value=model(torch.from_numpy(features(state)).unsqueeze(0))
        fixtures.append({'state':state,'actions':info['actions'],'features':features(state).tolist(),'logits':logits[0].tolist(),'value':float(value.item())})
finally: bridge.close()
checkpoint_name='bootstrap-checkpoint.pt' if architecture['type']=='mlp' else 'candidate-checkpoint.pt'
(out/'parity.json').write_text(json.dumps(fixtures,separators=(',',':')),encoding='utf-8');shutil.copyfile(checkpoint,out/checkpoint_name)
registry={'format':'atlas-model-registry-v1','active':None,'candidate':'candidate.json','checkpoint':checkpoint_name,'sha256':hashlib.sha256((out/'candidate.json').read_bytes()).hexdigest(),'metadata':metadata}
if args.report:
    report=json.loads(Path(args.report).read_text(encoding='utf-8'));registry['arena']=report['iterations'][-1]['arena'];registry['arena'].pop('games',None)
(out/'registry.json').write_text(json.dumps(registry,indent=2),encoding='utf-8');print('Experimental candidate exported; the live Atlas engine is unchanged.')
