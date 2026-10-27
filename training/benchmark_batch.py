"""Compare the same self-play scheduler at concurrency 1 vs N. No strength claim."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import time
from types import SimpleNamespace
import torch
from train import ROOT,Bridge,PolicyValue
from networks import load_model,model_config
from batch_selfplay import generate_games,sha_file,atomic_json

def main():
    p=argparse.ArgumentParser(); p.add_argument('--checkpoint',default='models/bootstrap-checkpoint.pt'); p.add_argument('--out',default='reports/gpu-batch/benchmark.json'); p.add_argument('--device',choices=['cpu','cuda'],default='cuda'); p.add_argument('--games',type=int,default=16); p.add_argument('--parallel-games',type=int,default=16); p.add_argument('--rules-workers',type=int,default=2); p.add_argument('--inference-batch',type=int,default=64); p.add_argument('--simulations',type=int,default=12); p.add_argument('--max-plies',type=int,default=120); p.add_argument('--repeats',type=int,default=2); a=p.parse_args()
    if min(a.games,a.parallel_games,a.rules_workers,a.inference_batch,a.simulations,a.max_plies,a.repeats)<1: raise ValueError('Invalid benchmark budget')
    if a.device=='cuda' and not torch.cuda.is_available(): raise RuntimeError('CUDA unavailable')
    torch.set_num_threads(2); saved=torch.load(a.checkpoint,map_location='cpu',weights_only=True); model=load_model(saved,a.device).eval()
    report={'format':'batched-selfplay-benchmark-v1','architecture':model_config(model),'torch':str(torch.__version__),'python':platform.python_version(),'logicalCpus':os.cpu_count(),'device':a.device,'gpu':torch.cuda.get_device_name(0) if a.device=='cuda' else None,'checkpointSha256':sha_file(a.checkpoint),'wasmSha256':sha_file(ROOT/'public/atlas.wasm'),'pipelineSha256':hashlib.sha256(''.join(sha_file(ROOT/f) for f in ['training/train.py','training/networks.py','training/batch_selfplay.py','training/bridge.mjs']).encode()).hexdigest(),'config':vars(a),'runs':[],'status':'running'}
    output=Path(a.out)
    if output.exists(): raise ValueError('Benchmark output already exists; preserve earlier evidence')
    output.parent.mkdir(parents=True,exist_ok=True); atomic_json(output,report)
    reference=None
    for repeat in range(a.repeats):
        for mode in (['serial','batched'] if repeat%2==0 else ['batched','serial']):
            args=SimpleNamespace(games=a.games,parallel_games=1 if mode=='serial' else a.parallel_games,rules_workers=1 if mode=='serial' else a.rules_workers,inference_batch=1 if mode=='serial' else a.inference_batch,simulations=a.simulations,max_plies=a.max_plies,bootstrap=.8,seed=271027)
            bridge=Bridge(); metrics={}; started=time.monotonic()
            try: results=list(generate_games(model,bridge,args,saved['iteration'],metrics=metrics))
            finally: bridge.close()
            elapsed=time.monotonic()-started; records=[game['records'] for _,game in results]
            if reference is None: reference=records
            plies=sum(game['plies'] for _,game in results); row={'repeat':repeat,'mode':mode,'elapsedSeconds':elapsed,'plies':plies,'trainingSamples':sum(len(examples) for examples,_ in results),'pliesPerSecond':plies/elapsed,'sameRecordsAsFirstRun':records==reference,'reasons':[game['reason'] for _,game in results],'metrics':metrics}; report['runs'].append(row); atomic_json(output,report); print(json.dumps({'repeat':repeat,'mode':mode,'seconds':round(elapsed,3),'plies':plies,'meanBatch':metrics['inference']['meanBatch'],'sameRecords':records==reference}),flush=True)
    summary={}
    for mode in ['serial','batched']:
        rows=[r for r in report['runs'] if r['mode']==mode]; seconds=sum(r['elapsedSeconds'] for r in rows); plies=sum(r['plies'] for r in rows)
        summary[mode]={'seconds':seconds,'plies':plies,'pliesPerSecond':plies/seconds,'forwardCalls':sum(r['metrics']['inference']['forwardCalls'] for r in rows)}
    summary['throughputRatio']=summary['batched']['pliesPerSecond']/summary['serial']['pliesPerSecond']; report['summary']=summary; report['status']='completed'; atomic_json(output,report); print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
