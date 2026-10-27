"""Versioned MLP and spatial residual policy/value networks.

Both consume the existing current-player 292-vector and emit 209 logits plus a
side-to-move value. The CNN preserves the exact pawn/horizontal/vertical layout.
"""
import torch
from torch import nn
from torch.nn import functional as F

FEATURES,ACTIONS=292,209

class PolicyValue(nn.Module):
    def __init__(self,hidden=128):
        super().__init__(); self.hidden=hidden
        self.trunk=nn.Sequential(nn.Linear(FEATURES,hidden),nn.ReLU(),nn.Linear(hidden,hidden),nn.ReLU())
        self.policy=nn.Linear(hidden,ACTIONS); self.value=nn.Linear(hidden,1)
    def forward(self,x):
        h=self.trunk(x); return self.policy(h),torch.tanh(self.value(h)).squeeze(-1)

class ResidualBlock(nn.Module):
    def __init__(self,channels):
        super().__init__()
        self.body=nn.Sequential(nn.Conv2d(channels,channels,3,padding=1,bias=False),nn.GroupNorm(8,channels),nn.ReLU(),nn.Conv2d(channels,channels,3,padding=1,bias=False),nn.GroupNorm(8,channels))
    def forward(self,x): return F.relu(x+self.body(x))

class ResidualPolicyValue(nn.Module):
    def __init__(self,channels=64,blocks=4):
        super().__init__(); self.channels=channels; self.blocks=blocks; self.hidden=channels
        fixed=torch.zeros(3,9,9); fixed[0,:8,:8]=1; fixed[1,0,:]=1; fixed[2,8,:]=1
        self.register_buffer('fixed_planes',fixed,persistent=False)
        self.stem=nn.Sequential(nn.Conv2d(9,channels,3,padding=1,bias=False),nn.GroupNorm(8,channels),nn.ReLU())
        self.residual=nn.Sequential(*(ResidualBlock(channels) for _ in range(blocks)))
        self.policy_head=nn.Conv2d(channels,3,1)
        self.value_head=nn.Sequential(nn.Conv2d(channels,8,1,bias=False),nn.GroupNorm(4,8),nn.ReLU(),nn.Flatten(),nn.Linear(8*81,64),nn.ReLU(),nn.Linear(64,1),nn.Tanh())
    def encode(self,x):
        if x.ndim!=2 or x.shape[1]!=FEATURES: raise ValueError('Expected [batch,292] current-player features')
        pawns=x[:,:162].reshape(-1,2,9,9)
        walls=F.pad(x[:,162:290].reshape(-1,2,8,8),(0,1,0,1))
        resources=x[:,290:].reshape(-1,2,1,1).expand(-1,-1,9,9)
        fixed=self.fixed_planes.unsqueeze(0).expand(x.shape[0],-1,-1,-1)
        return torch.cat([pawns,walls,resources,fixed],dim=1)
    def forward(self,x):
        h=self.residual(self.stem(self.encode(x))); p=self.policy_head(h)
        logits=torch.cat([p[:,0].flatten(1),p[:,1,:8,:8].flatten(1),p[:,2,:8,:8].flatten(1)],dim=1)
        return logits,self.value_head(h).squeeze(-1)

def validate_config(config):
    if not isinstance(config,dict): raise ValueError('Missing model architecture')
    if config.get('type')=='mlp':
        hidden=config.get('hidden')
        if type(hidden) is not int or not 1<=hidden<=2048: raise ValueError('Invalid MLP width')
        return {'type':'mlp','hidden':hidden}
    if config.get('type')=='rescnn':
        channels,blocks=config.get('channels'),config.get('blocks')
        if type(channels) is not int or channels%8 or not 8<=channels<=256 or type(blocks) is not int or not 1<=blocks<=16: raise ValueError('Invalid residual CNN configuration')
        return {'type':'rescnn','channels':channels,'blocks':blocks}
    raise ValueError('Unsupported model architecture')

def model_config(model):
    if isinstance(model,ResidualPolicyValue): return {'type':'rescnn','channels':model.channels,'blocks':model.blocks}
    if isinstance(model,PolicyValue): return {'type':'mlp','hidden':model.hidden}
    raise ValueError('Unregistered policy/value network')

def create_model(config):
    config=validate_config(config)
    return PolicyValue(config['hidden']) if config['type']=='mlp' else ResidualPolicyValue(config['channels'],config['blocks'])

def checkpoint_config(saved):
    if saved.get('format') not in {None,'atlas-training-v1','atlas-training-v2','atlas-model-snapshot-v1'}: raise ValueError('Unsupported checkpoint format')
    config=saved.get('architecture')
    if config is None:
        if saved.get('format')=='atlas-training-v2': raise ValueError('Version 2 checkpoint needs architecture metadata')
        config={'type':'mlp','hidden':saved.get('hidden')}
    return validate_config(config)

def load_model(saved,device='cpu'):
    model=create_model(checkpoint_config(saved)).to(device)
    model.load_state_dict(saved['model'],strict=True); return model

def select_config(args,saved=None):
    if saved is None:
        kind=args.architecture or 'mlp'
        if kind=='mlp' and (args.channels is not None or args.blocks is not None): raise ValueError('CNN dimensions need --architecture rescnn')
        if kind=='rescnn' and args.hidden is not None: raise ValueError('--hidden is an MLP option')
        config={'type':'mlp','hidden':128 if args.hidden is None else args.hidden} if kind=='mlp' else {'type':'rescnn','channels':64 if args.channels is None else args.channels,'blocks':4 if args.blocks is None else args.blocks}
    else:
        config=checkpoint_config(saved)
        if args.architecture and args.architecture!=config['type']: raise ValueError('Resume architecture changed')
        for option,key in [('hidden','hidden'),('channels','channels'),('blocks','blocks')]:
            value=getattr(args,option,None)
            if value is not None and config.get(key)!=value: raise ValueError(f'Resume {option} changed')
    return validate_config(config)
