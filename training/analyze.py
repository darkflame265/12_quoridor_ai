"""Analyze a saved replay with an explicitly selected experimental checkpoint."""
import argparse,json
from pathlib import Path
import numpy as np
import torch
from train import Bridge,PolicyValue,MCTS,action_object
p=argparse.ArgumentParser();p.add_argument('--checkpoint',default='models/bootstrap-checkpoint.pt');p.add_argument('--game',required=True);p.add_argument('--simulations',type=int,default=128);p.add_argument('--bootstrap',type=float,default=0);args=p.parse_args()
torch.set_num_threads(2);saved=torch.load(args.checkpoint,map_location='cpu',weights_only=True);model=PolicyValue(saved['hidden']);model.load_state_dict(saved['model']);model.eval();bridge=Bridge()
try:
    game=json.loads(Path(args.game).read_text(encoding='utf-8'));state=bridge.call(op='validate',records=game['records'])['state']
    if state['winner'] is not None: print(json.dumps({'winner':state['winner'],'terminal':True}))
    else:
        action,policy=MCTS(model,bridge,np.random.default_rng(271027),args.simulations,args.bootstrap).search(state)
        print(json.dumps({'action':action_object(action),'iteration':saved['iteration'],'simulations':args.simulations,'bootstrap':args.bootstrap,'experimental':True}))
finally:bridge.close()
