"""Archive an experimental model with a completed report; never activate it."""
import argparse
import json
from pathlib import Path
import torch
from networks import load_model,model_config
from learner import snapshot,save_torch,pipeline_hash
from batch_selfplay import sha_file,atomic_json
from train import ROOT,Bridge,features

def export(checkpoint,report_file,directory):
    checkpoint=Path(checkpoint); report_file=Path(report_file); directory=Path(directory)
    if directory.resolve()==(ROOT/'models').resolve(): raise ValueError('Use a separate experimental model directory')
    report=json.loads(report_file.read_text(encoding='utf-8')); saved=torch.load(checkpoint,map_location='cpu',weights_only=True)
    if report['status']!='completed' or report['pipelineSha256']!=saved.get('pipelineSha256') or report['pipelineSha256']!=pipeline_hash(): raise ValueError('Incomplete or changed training pipeline')
    digest=sha_file(checkpoint); matches=[e for e in report['iterations'] if digest in [e.get('checkpointSha256'),e.get('bestValidationCheckpointSha256')]]
    if not matches or matches[0]['iteration']+1!=saved['iteration']: raise ValueError('Checkpoint does not match the training report')
    model=load_model(saved).eval()
    if model_config(model)!=report['architecture']: raise ValueError('Model architecture and report disagree')
    if report['ruleArtifactSha256']!=sha_file(ROOT/'public/atlas.wasm'): raise ValueError('Rules artifact changed')
    if directory.exists() and any(directory.iterdir()): raise ValueError('Experiment output is not empty')
    directory.mkdir(parents=True,exist_ok=True); save_torch(directory/'experimental.pt',snapshot(model,saved['iteration']))
    bridge=Bridge(); parity=[]
    try:
        for s in [bridge.call(op='initial')['state'],bridge.call(op='opening',index=2)['state']]:
            with torch.inference_mode(): logits,value=model(torch.from_numpy(features(s))[None,:])
            parity.append({'state':s,'features':features(s).tolist(),'logits':logits[0].tolist(),'value':value.item()})
    finally: bridge.close()
    atomic_json(directory/'parity.json',parity)
    metadata={'format':'atlas-neural-experiment-v1','architecture':model_config(model),'checkpoint':'experimental.pt','sha256':sha_file(directory/'experimental.pt'),'sourceTrainingCheckpointSha256':digest,'trainingReportSha256':sha_file(report_file),'pipelineSha256':report['pipelineSha256'],'selectedIteration':saved['iteration'],'validation':matches[0]['validationAfter'],'productionActive':False,'note':'Validation-selected experimental weights. This does not activate a live neural engine.'}
    atomic_json(directory/'metadata.json',metadata); return metadata

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--checkpoint',required=True); p.add_argument('--report',required=True); p.add_argument('--out',required=True); a=p.parse_args(); print(json.dumps(export(a.checkpoint,a.report,a.out),indent=2))
