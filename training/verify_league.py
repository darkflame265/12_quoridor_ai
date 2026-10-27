"""Recheck immutable league receipt, inputs, replay results and timing totals."""
import argparse
import json
import math
from pathlib import Path
from train import ROOT,Bridge
from league import assess,source_identity,NativeBridge
from batch_selfplay import sha_file

def verify(directory):
    directory=Path(directory); report=json.loads((directory/'report.json').read_text(encoding='utf-8')); receipt=json.loads((directory/'selection.json').read_text(encoding='utf-8'))
    if receipt['reportSha256']!=sha_file(directory/'report.json') or report['status']!='completed': raise ValueError('League report changed or incomplete')
    if source_identity()!=report['sources']: raise ValueError('League source changed')
    for model in [report['candidate'],*report['pastModels']]:
        file=Path(model['file']); file=file if file.is_absolute() else ROOT/file
        if sha_file(file)!=model['sha256']: raise ValueError('League model changed')
    if receipt['candidateSha256']!=report['candidate']['sha256'] or receipt['productionActive'] is not False or report['productionActive'] is not False: raise ValueError('Invalid selection receipt')
    expected=assess(report)
    if expected!=report['decision'] or receipt['selected']!=expected['eligible']: raise ValueError('League decision mismatch')
    native=NativeBridge(); rules=Bridge(); totals={}; count=0
    try:
        if native.call(op='identity')!=report['native']: raise ValueError('Native reference changed')
        for entry in report['games']:
            file=(directory/entry['file']).resolve()
            if directory.resolve() not in file.parents or sha_file(file)!=entry['sha256']: raise ValueError('Replay file changed or outside report')
            game=json.loads(file.read_text(encoding='utf-8')); state=rules.call(op='validate',records=game['records'])['state']
            for key,value in entry.items():
                if key not in ['file','sha256'] and game.get(key)!=value: raise ValueError('Replay metadata mismatch')
            outcome='draw' if state['winner'] is None else 'win' if state['winner']==game['candidateSide'] else 'loss'
            if outcome!=game['result'] or state['winner']!=game['winner']: raise ValueError('Replay winner mismatch')
            opening=native.call(op='opening',split=game['split'],suite=game['suite'],index=game['openingIndex'])
            prefix=len(opening['records'])
            if game['records'][:prefix]!=opening['records'] or len(game['trace'])!=len(game['records'])-prefix: raise ValueError('Opening or trace mismatch')
            for i,t in enumerate(game['trace']):
                expected_role='candidate' if (opening['state']['turn']+i)%2==game['candidateSide'] else game['opponent']
                if t['ply']!=i or t['role']!=expected_role or t['action']!=game['records'][prefix+i]: raise ValueError('Trace action or role mismatch')
                role=t['role']; total=totals.setdefault(role,{'moves':0,'elapsedMs':0.,'overruns':0,'maxMs':0.}); ms=t['elapsedMs']
                if not math.isfinite(ms) or ms<0: raise ValueError('Invalid time')
                total['moves']+=1; total['elapsedMs']+=ms; total['overruns']+=int(ms>report['ms']*1.2+5); total['maxMs']=max(total['maxMs'],ms)
            count+=1
        if totals!=report['timing']: raise ValueError('Timing totals mismatch')
    finally: native.close(); rules.close()
    return {'validatedGames':count,'selected':expected['eligible'],'productionActive':False,'reportSha256':receipt['reportSha256']}

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('directory'); args=p.parse_args(); print(json.dumps(verify(args.directory),indent=2))
