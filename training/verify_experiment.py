"""Check a report-bound experimental model, CPU/GPU predictions and replays."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from networks import load_model,model_config
from learner import pipeline_hash,evaluate_samples,unpack
from batch_selfplay import sha_file,atomic_json
from train import Bridge,features

def verify(directory,report_file,games_directory=None,training_checkpoint=None):
    torch.set_num_threads(2); directory=Path(directory); report_file=Path(report_file)
    metadata=json.loads((directory/'metadata.json').read_text(encoding='utf-8')); report=json.loads(report_file.read_text(encoding='utf-8'))
    if metadata['productionActive'] is not False or metadata['pipelineSha256']!=pipeline_hash() or sha_file(report_file)!=metadata['trainingReportSha256']: raise ValueError('Experiment provenance changed')
    if sha_file(directory/metadata['checkpoint'])!=metadata['sha256']: raise ValueError('Experimental weights changed')
    saved=torch.load(directory/metadata['checkpoint'],map_location='cpu',weights_only=True); model=load_model(saved).eval()
    if model_config(model)!=metadata['architecture']: raise ValueError('Architecture mismatch')
    if any(not torch.isfinite(t).all() for t in model.state_dict().values()): raise ValueError('Non-finite model weights')
    fixtures=json.loads((directory/'parity.json').read_text(encoding='utf-8')); x=torch.tensor(np.stack([features(f['state']) for f in fixtures])); max_error=0.
    with torch.inference_mode():
        logits,value=model(x)
        for i,f in enumerate(fixtures):
            np.testing.assert_allclose(x[i].numpy(),f['features'],atol=1e-7); np.testing.assert_allclose(logits[i].numpy(),f['logits'],atol=1e-4,rtol=1e-4); np.testing.assert_allclose(value[i].item(),f['value'],atol=1e-4,rtol=1e-4)
    gpu_error=None
    if torch.cuda.is_available():
        gpu=load_model(saved,'cuda').eval(); previous=torch.backends.cudnn.allow_tf32
        try:
            torch.backends.cudnn.allow_tf32=False
            with torch.inference_mode():
                for a,b in zip(model(x),gpu(x.cuda())):
                    torch.testing.assert_close(a,b.cpu(),atol=1e-4,rtol=1e-4); max_error=max(max_error,float((a-b.cpu()).abs().max()))
            gpu_error=max_error
        finally: torch.backends.cudnn.allow_tf32=previous
    validation=None; overlap=None; zero_mse=None
    if training_checkpoint:
        if sha_file(training_checkpoint)!=metadata['sourceTrainingCheckpointSha256']: raise ValueError('Full training checkpoint changed')
        full=torch.load(training_checkpoint,map_location='cpu',weights_only=True); train=unpack(full); held=unpack(full,'validation_'); overlap=len({a.tobytes() for a,_,_ in train}&{a.tobytes() for a,_,_ in held})
        if overlap: raise ValueError('Validation state leaked into replay')
        validation=evaluate_samples(model,held); np.testing.assert_allclose(validation['loss'],metadata['validation']['loss'],atol=1e-3,rtol=1e-3); zero_mse=float(np.mean([float(z)**2 for _,_,z in held]))
    replay_count=0; fingerprint=hashlib.sha256(); bridge=Bridge()
    try:
        if games_directory:
            for iteration in report['iterations']:
                for game_id,expected in enumerate(iteration['games']):
                    file=Path(games_directory)/f'iteration-{iteration["iteration"]}-game-{game_id}.json'; game=json.loads(file.read_text(encoding='utf-8'))
                    if {k:v for k,v in game.items() if k!='records'}!=expected: raise ValueError('Game metadata disagrees with training report')
                    result=bridge.call(op='validate',records=game['records'])['state']
                    if result['winner']!=game['winner'] or len(game['records'])-game['openingPlies']!=game['plies']: raise ValueError('Training replay mismatch')
                    fingerprint.update((file.name+':'+sha_file(file)).encode()); replay_count+=1
    finally: bridge.close()
    return {'architecture':model_config(model),'parameters':sum(p.numel() for p in model.parameters()),'selectedIteration':saved['iteration'],'checkpointSha256':metadata['sha256'],'pipelineSha256':pipeline_hash(),'cpuParityPassed':True,'gpuMaxAbsoluteError':gpu_error,'trainValidationOverlap':overlap,'recomputedValidation':validation,'zeroValueBaselineMse':zero_mse,'validatedSelfplayGames':replay_count,'replaysSha256':fingerprint.hexdigest(),'productionActive':False}

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--model',required=True); p.add_argument('--report',required=True); p.add_argument('--games'); p.add_argument('--training-checkpoint'); p.add_argument('--out',required=True); a=p.parse_args(); result=verify(a.model,a.report,a.games,a.training_checkpoint); atomic_json(a.out,result); print(json.dumps(result,indent=2))
