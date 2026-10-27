"""Architecture-aware learning, held-out games, and complete iteration snapshots."""
import copy
import hashlib
import json
import os
from pathlib import Path
import random
import time
import numpy as np
import torch
from networks import create_model,load_model,model_config,select_config
from train import ROOT,FEATURES,ACTIONS,Bridge,selfplay,arena,tactical_validation,export_model
from batch_selfplay import arrays,atomic_json,replace_file,sha_file,load_split_dataset,generate_games

SOURCE_FILES=['training/train.py','training/learner.py','training/networks.py','training/batch_selfplay.py','training/bridge.mjs']
def pipeline_hash(): return hashlib.sha256(''.join(sha_file(ROOT/f) for f in SOURCE_FILES).encode()).hexdigest()

def snapshot(model,iteration):
    return {'format':'atlas-model-snapshot-v1','featureSchema':'atlas-292-current-turn-v1','architecture':model_config(model),'hidden':model.hidden,'iteration':iteration,'model':{k:v.detach().cpu().clone() for k,v in model.state_dict().items()}}

def save_torch(path,data):
    path=Path(path); temporary=path.with_name(path.name+'.tmp')
    with temporary.open('wb') as stream: torch.save(data,stream); stream.flush(); os.fsync(stream.fileno())
    replace_file(temporary,path)

def unpack(saved,prefix=''):
    if prefix+'x' not in saved: return []
    return list(zip(saved[prefix+'x'].cpu().numpy(),saved[prefix+'pi'].cpu().numpy(),saved[prefix+'z'].cpu().numpy()))

def make_checkpoint(model,optimizer,iteration,replay,validation,rng,**extra):
    x,pi,z=arrays(replay); vx,vpi,vz=arrays(validation)
    result={**snapshot(model,iteration),'format':'atlas-training-v2','optimizer':optimizer.state_dict(),'torch_rng':torch.get_rng_state(),'numpy_rng':json.dumps(rng.bit_generator.state),'python_rng':random.getstate(),'x':torch.from_numpy(x),'pi':torch.from_numpy(pi),'z':torch.from_numpy(z),'validation_x':torch.from_numpy(vx),'validation_pi':torch.from_numpy(vpi),'validation_z':torch.from_numpy(vz),'pipelineSha256':pipeline_hash(),**extra}
    if next(model.parameters()).device.type=='cuda': result['cuda_rng']=torch.cuda.get_rng_state_all()
    return result

def restore_rng(saved,rng,device):
    torch.set_rng_state(saved['torch_rng'].cpu()); rng.bit_generator.state=json.loads(saved['numpy_rng'])
    if 'python_rng' in saved: random.setstate(saved['python_rng'])
    if device=='cuda' and saved.get('cuda_rng'): torch.cuda.set_rng_state_all([s.cpu() for s in saved['cuda_rng']])

@torch.inference_mode()
def evaluate_samples(model,samples,batch_size=256):
    if not samples: return None
    model.eval(); device=next(model.parameters()).device; policy_total=value_total=correct=0.
    for start in range(0,len(samples),batch_size):
        x,pi,z=arrays(samples[start:start+batch_size]); x=torch.from_numpy(x).to(device); pi=torch.from_numpy(pi).to(device); z=torch.from_numpy(z).to(device)
        logits,value=model(x); policy_total+=float((-(pi*torch.log_softmax(logits,dim=-1)).sum(-1)).sum().item()); value_total+=float(((value-z)**2).sum().item()); correct+=float((logits.argmax(-1)==pi.argmax(-1)).sum().item())
    n=len(samples); return {'samples':n,'policyLoss':policy_total/n,'valueMse':value_total/n,'loss':(policy_total+value_total)/n,'policyTop1':correct/n}

def run(args):
    os.environ.setdefault('CUBLAS_WORKSPACE_CONFIG',':4096:8')
    torch.set_num_threads(args.threads); torch.manual_seed(args.seed); random.seed(args.seed); rng=np.random.default_rng(args.seed)
    device='cuda' if torch.cuda.is_available() and not args.cpu else 'cpu'
    if args.resume and args.init_checkpoint: raise ValueError('Choose resume or weight initialization, not both')
    source=args.resume or args.init_checkpoint
    saved=torch.load(source,map_location='cpu',weights_only=True) if source else None
    if args.deterministic is None: args.deterministic=saved.get('deterministic',False) if args.resume else False
    torch.use_deterministic_algorithms(args.deterministic)
    if args.lr is None: args.lr=saved['optimizer']['param_groups'][0]['lr'] if args.resume and 'optimizer' in saved else 1e-3
    config=select_config(args,saved); model=create_model(config).to(device)
    if saved is not None: model.load_state_dict(saved['model'])
    optimizer=torch.optim.Adam(model.parameters(),lr=args.lr,weight_decay=1e-4)
    iteration=0; replay=[]; validation=[]; imported=None; best_loss=None; best_iteration=None
    if args.resume:
        if 'optimizer' not in saved or saved.get('format') not in {'atlas-training-v1','atlas-training-v2'}: raise ValueError('Resume needs a full training checkpoint; use --init-checkpoint for weights only')
        if saved.get('pipelineSha256') and saved['pipelineSha256']!=pipeline_hash(): raise ValueError('Training pipeline changed; start a new run with --init-checkpoint')
        if saved.get('trainingSeed',args.seed)!=args.seed: raise ValueError('Resume seed changed')
        optimizer.load_state_dict(saved['optimizer']); iteration=saved['iteration']; replay=unpack(saved); validation=unpack(saved,'validation_'); imported=saved.get('replayImport'); best_loss=saved.get('bestValidationLoss'); best_iteration=saved.get('bestValidationIteration')
        for group in optimizer.param_groups: group['lr']=args.lr
    fraction=args.validation_fraction
    if fraction is None: fraction=imported.get('validationFraction',0.) if imported else .2 if config['type']=='rescnn' and args.replay_dir else 0.
    if args.replay_dir:
        manifest_sha=sha_file(Path(args.replay_dir)/'manifest.json')
        if imported:
            if imported['manifestSha256']!=manifest_sha or imported.get('validationFraction',0.)!=fraction: raise ValueError('Resume dataset or validation split changed')
        else:
            incoming,validation,imported=load_split_dataset(args.replay_dir,fraction,args.seed,args.replay_size); replay.extend(incoming)
    elif imported and args.validation_fraction is not None and fraction!=imported.get('validationFraction',0.): raise ValueError('Resume validation split changed')
    reserved={x.tobytes() for x,_,_ in validation}; replay=[e for e in replay if e[0].tobytes() not in reserved][-args.replay_size:]
    output=Path(args.out)
    if (output/'checkpoint.pt').exists() and not args.resume: raise ValueError('Output already has a checkpoint; resume it or use a fresh directory')
    output.mkdir(parents=True,exist_ok=True); (output/'games').mkdir(exist_ok=True); snapshots=output/'snapshots'; snapshots.mkdir(exist_ok=True)
    champion_data=None
    if args.champion: champion_data=torch.load(args.champion,map_location='cpu',weights_only=True)
    elif args.resume: champion_data=saved.get('championSnapshot')
    if champion_data is None: champion_data=snapshot(model,iteration)
    champion=load_model(champion_data,device).eval(); champion_iteration=champion_data['iteration']
    history=copy.deepcopy(saved.get('history',[])) if args.resume else []
    if not history: history=[snapshot(champion,champion_iteration)]
    registry=copy.deepcopy(saved.get('registry',{'active':None,'candidates':[]})) if args.resume else {'active':None,'candidates':[]}
    save_torch(output/'champion.pt',snapshot(champion,champion_iteration))
    report_path=output/'report.json'; previous=json.loads(report_path.read_text(encoding='utf-8')) if args.resume and report_path.exists() else None
    if previous and previous.get('architecture')!=config: raise ValueError('Output report architecture changed')
    report={'format':'atlas-training-report-v2','architecture':config,'parameters':sum(p.numel() for p in model.parameters()),'device':device,'torch':str(torch.__version__),'deterministic':args.deterministic,'float32MatmulPrecision':torch.get_float32_matmul_precision(),'cudnnTf32':torch.backends.cudnn.allow_tf32,'seed':args.seed,'config':vars(args),'iterations':[e for e in previous.get('iterations',[]) if e['iteration']<iteration] if previous else [],'runSegments':previous.get('runSegments',[]) if previous else [],'status':'running','ruleArtifactSha256':sha_file(ROOT/'public/atlas.wasm'),'pipelineSha256':pipeline_hash(),'replayImport':imported}
    report['runSegments'].append({'startIteration':iteration,'requestedIterations':args.iterations,'resumeSha256':sha_file(args.resume) if args.resume else None,'config':vars(args)})
    if args.resume: restore_rng(saved,rng,device)
    bridge=Bridge(); started=time.monotonic()
    try:
        for it in range(iteration,iteration+args.iterations):
            model.eval(); selfplay_metrics={}; games=[]; collected=excluded=0
            collection=generate_games(model,bridge,args,it,metrics=selfplay_metrics) if args.selfplay_backend=='batched' else (selfplay(model,bridge,rng,args,it,g) for g in range(args.games))
            try:
                for g,(examples,game) in enumerate(collection):
                    allowed=[e for e in examples if e[0].tobytes() not in reserved]; excluded+=len(examples)-len(allowed); replay.extend(allowed); collected+=len(allowed); games.append({k:v for k,v in game.items() if k!='records'})
                    atomic_json(output/'games'/f'iteration-{it}-game-{g}.json',game); print(f'iteration {it} game {g}: {game["reason"]}, {len(allowed)} training samples',flush=True)
            finally: collection.close()
            replay=replay[-args.replay_size:]
            if not replay: raise RuntimeError('No completed training samples; import data or increase self-play budget')
            before=evaluate_samples(model,replay,args.batch_size*4); validation_before=evaluate_samples(model,validation,args.batch_size*4)
            x,pi,z=arrays(replay); x=torch.from_numpy(x).to(device); pi=torch.from_numpy(pi).to(device); z=torch.from_numpy(z).to(device)
            model.train(); losses=[]
            for _ in range(args.epochs):
                for ids in torch.randperm(len(replay),device=device).split(args.batch_size):
                    logits,value=model(x[ids]); loss=-(pi[ids]*torch.log_softmax(logits,dim=-1)).sum(-1).mean()+((value-z[ids])**2).mean()
                    if not torch.isfinite(loss): raise RuntimeError('Non-finite training loss')
                    optimizer.zero_grad(); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),5); optimizer.step(); losses.append(float(loss.item()))
            model.eval(); after=evaluate_samples(model,replay,args.batch_size*4); validation_after=evaluate_samples(model,validation,args.batch_size*4)
            entry={'iteration':it,'games':games,'collected':collected,'replaySamples':len(replay),'loss':sum(losses)/len(losses),'selfplayMetrics':selfplay_metrics,'beforeTraining':before,'afterTraining':after,'validationBefore':validation_before,'validationAfter':validation_after,'validationPositionsExcluded':excluded,'optimization':{k:getattr(args,k) for k in ['epochs','batch_size','simulations','bootstrap','lr']},'evaluated':(it+1)%args.evaluation_interval==0 or it==iteration+args.iterations-1,'promoted':False}
            if entry['evaluated']:
                entry['arena']=arena(model,bridge,rng,args); entry['championArena']=arena(model,bridge,rng,args,opponent_model=champion); entry['championArchitecture']=model_config(champion)
                past=history[it%len(history)]; past_model=load_model(past,device).eval(); entry['historicalArena']=arena(model,bridge,rng,args,opponent_model=past_model); entry['historicalArena']['snapshotIteration']=past['iteration']; entry['historicalArena']['architecture']=model_config(past_model)
                entry['tactics']=tactical_validation(model,bridge,rng,args)
                eligible=entry['arena']['promotionEligible'] and entry['championArena']['promotionEligible'] and entry['historicalArena']['promotionEligible'] and all(t['pass'] for t in entry['tactics'])
                if eligible: entry['holdout']=arena(model,bridge,rng,args,split='holdout'); eligible=entry['holdout']['promotionEligible']
                entry['promoted']=eligible
                if eligible:
                    champion=copy.deepcopy(model).eval(); champion_iteration=it+1; save_torch(output/'champion.pt',snapshot(champion,champion_iteration)); export_model(champion,output/'champion.json',{'validated':True,'productionActive':False,'iteration':it+1}); registry['active']='champion.json'
                del past_model
            registry['candidates'].append({'iteration':it+1,'promoted':entry['promoted'],'evaluated':entry['evaluated']})
            history.append(snapshot(model,it+1)); history=history[-args.league_size:]
            save_torch(snapshots/f'iteration-{it+1:06d}.pt',history[-1])
            for old in sorted(snapshots.glob('iteration-*.pt'))[:-args.league_size]: old.unlink()
            improved=validation_after is not None and (best_loss is None or validation_after['loss']<best_loss)
            if improved: best_loss=validation_after['loss']; best_iteration=it+1
            entry['bestValidationIteration']=best_iteration
            report['iterations'].append(entry); report['elapsedSeconds']=time.monotonic()-started; report['bestValidationLoss']=best_loss; report['bestValidationIteration']=best_iteration
            checkpoint=make_checkpoint(model,optimizer,it+1,replay,validation,rng,trainingSeed=args.seed,deterministic=args.deterministic,trainingDevice=device,replayImport=imported,bestValidationLoss=best_loss,bestValidationIteration=best_iteration,championSnapshot=snapshot(champion,champion_iteration),history=history,registry=registry)
            save_torch(output/'checkpoint.pt',checkpoint)
            entry['checkpointSha256']=sha_file(output/'checkpoint.pt')
            if improved:
                save_torch(output/'best-validation.pt',checkpoint); entry['bestValidationCheckpointSha256']=sha_file(output/'best-validation.pt')
            export_model(model,output/'candidate.json',{'iteration':it+1,'bootstrap':args.bootstrap,'validated':False,'productionActive':False})
            atomic_json(output/'registry.json',registry); atomic_json(report_path,report)
            print(f'iteration {it}: loss={entry["loss"]:.4f}, validation={None if validation_after is None else round(validation_after["loss"],4)}, promoted={entry["promoted"]}',flush=True)
        report['status']='completed'; atomic_json(report_path,report)
    except BaseException as error:
        report['status']='interrupted' if isinstance(error,KeyboardInterrupt) else 'failed'; report['error']=type(error).__name__; atomic_json(report_path,report); raise
    finally: bridge.close()
    return report
