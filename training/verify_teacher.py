"""Rebuild teacher splits and independently recompute archived model metrics."""
import argparse
import json
from pathlib import Path
import numpy as np
import torch
from teacher import identity,load_data,split_data,metrics
from networks import load_model
from batch_selfplay import sha_file,atomic_json

def verify(dataset,report_file,model_directory):
    torch.set_num_threads(2); dataset=Path(dataset); report_file=Path(report_file); directory=Path(model_directory)
    report=json.loads(report_file.read_text(encoding='utf-8')); metadata=json.loads((directory/'metadata.json').read_text(encoding='utf-8'))
    if report['status']!='completed' or report['inputs']['sources']!=identity() or metadata['trainingReportSha256']!=sha_file(report_file): raise ValueError('Teacher report or sources changed')
    if metadata['sha256']!=sha_file(directory/'experimental.pt') or metadata['sourceBestSha256']!=report['bestSha256'] or metadata['selectedEpoch']!=report['bestEpoch'] or metadata['productionActive'] is not False: raise ValueError('Teacher model receipt changed')
    config=report['config']
    if sha_file(dataset/'manifest.json')!=report['inputs']['datasetSha256'] or sha_file(config['checkpoint'])!=report['inputs']['initialCheckpointSha256']: raise ValueError('Teacher training inputs changed')
    manifest,groups=load_data(dataset,config['value_blend']); train,held,split=split_data(groups,config['seed'],config['validation_fraction'])
    if split!=report['split'] or split['mirrorAwareOverlap']: raise ValueError('Teacher split changed or leaked')
    base=load_model(torch.load(config['checkpoint'],map_location='cpu',weights_only=True)).eval(); selected=load_model(torch.load(directory/'experimental.pt',map_location='cpu',weights_only=True)).eval()
    if any(not torch.isfinite(t).all() for t in selected.state_dict().values()): raise ValueError('Non-finite model')
    before=metrics(base,held); after=metrics(selected,held)
    expected=report['before']['validation'] if report['bestEpoch']==0 else report['epochs'][report['bestEpoch']-1]['validation']
    if not np.allclose(list(after.values()),list(expected.values()),atol=.001,rtol=.001) or not np.allclose(list(before.values()),list(report['before']['validation'].values()),atol=.001,rtol=.001): raise ValueError('Teacher validation metric mismatch')
    losses=[report['before']['validation']['loss'],*[r['validation']['loss'] for r in report['epochs']]]
    if int(np.argmin(losses))!=report['bestEpoch'] or abs(min(losses)-report['bestLoss'])>1e-8: raise ValueError('Best model selection mismatch')
    # CPU/GPU inference parity, independent from training metrics.
    parity=None
    if torch.cuda.is_available():
        x=torch.from_numpy(np.stack([r[0] for r in held[:8]])); gpu=load_model(torch.load(directory/'experimental.pt',map_location='cpu',weights_only=True),'cuda').eval()
        old=torch.backends.cudnn.allow_tf32; torch.backends.cudnn.allow_tf32=False
        try:
            with torch.inference_mode(): c=selected(x); g=gpu(x.cuda()); parity=max((a-b.cpu()).abs().max().item() for a,b in zip(c,g))
            if parity>.0001: raise ValueError('CPU/GPU parity failed')
        finally: torch.backends.cudnn.allow_tf32=old
    return {'validatedGames':len(groups),'completedTrainingGames':sum(bool(g['rows']) for g in groups),'split':split,'beforeValidation':before,'selectedValidation':after,'gpuMaxAbsoluteError':parity,'productionActive':False}

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--dataset',required=True); p.add_argument('--report',required=True); p.add_argument('--model',required=True); p.add_argument('--out'); args=p.parse_args(); result=verify(args.dataset,args.report,args.model)
    if args.out: atomic_json(args.out,result)
    print(json.dumps(result,indent=2))
