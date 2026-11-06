from __future__ import annotations
import json
import hashlib
import sys
import tempfile
from pathlib import Path

import numpy as np
import torch
from torch import nn
import onnxruntime as ort

ROOT=Path(__file__).resolve().parent.parent
E=ROOT/'evaluation'
sys.path.insert(0,str(Path(tempfile.gettempdir())/'sigma4_onnx_research_deps'))
import onnx

class ResearchResidualValue(nn.Module):
    def __init__(self):
        super().__init__()
        self.network=nn.Sequential(nn.Linear(6,12),nn.Tanh(),nn.Linear(12,1))
    def forward(self,features,original_logit):
        corrected_logit=original_logit+self.network(features).squeeze(-1)
        return 2*torch.sigmoid(corrected_logit).unsqueeze(-1)-1

src=E/'sigma4-value-residual-research-20261106.pt'
check=torch.load(src,map_location='cpu',weights_only=True)
model=ResearchResidualValue()
model.load_state_dict(check['model'])
model.eval()
onnx_path=E/'sigma4-value-residual-research-20261106.onnx'
with torch.no_grad():
    torch.onnx.export(
        model,(torch.zeros(1,6,dtype=torch.float32),torch.zeros(1,dtype=torch.float32)),
        str(onnx_path),opset_version=17,dynamo=False,
        input_names=['features','original_logit'],output_names=['corrected_value'],
        dynamic_axes={'features':{0:'batch'},'original_logit':{0:'batch'},'corrected_value':{0:'batch'}},
        do_constant_folding=True
    )
loaded=onnx.load(str(onnx_path))
onnx.checker.check_model(loaded)
session=ort.InferenceSession(str(onnx_path),providers=['CPUExecutionProvider'])
assert session.get_inputs()[0].name=='features'
assert session.get_inputs()[1].name=='original_logit'
assert session.get_outputs()[0].name=='corrected_value'
rng=np.random.default_rng(20261106)
features=rng.normal(size=(40,6)).astype(np.float32)
logits=np.clip(rng.normal(0,2,size=40),-6,6).astype(np.float32)
features[:,0]=np.clip(logits,-6,6)/4
with torch.no_grad():
    expected=model(torch.from_numpy(features),torch.from_numpy(logits)).numpy()
actual=session.run(['corrected_value'],{'features':features,'original_logit':logits})[0]
assert expected.shape==(40,1) and actual.shape==(40,1)
maximum_error=float(np.max(np.abs(expected-actual)))
assert maximum_error<2e-6,maximum_error
assert np.all(np.isfinite(actual))
assert np.max(actual)<=1+1e-5 and np.min(actual)>=-1-1e-5
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest={'version':'sigma4-value-correction-onnx-export-v1',
 'format':'separate research-only ONNX correction head; not a drop-in 8x9x9 base network',
 'baseNetwork':'vendor/sigma-quoridor/models/best.onnx',
 'checkpoint':src.name,'checkpointSha256':sha(src),
 'onnxFilename':onnx_path.name,'onnxSha256':sha(onnx_path),
 'opset':17,'inputSchema':{'features':['batch',6],'original_logit':['batch']},
 'outputSchema':{'corrected_value':['batch',1]},
 'featureNames':check['features'],
 'testSamples':len(features),'maxAbsoluteTorchOnnxError':maximum_error,
 'exportValidated':True,
 'productionApproved':False,
 'warnings':['Requires original base-network value and original game state geometry features',
  'Cannot replace best.onnx without engine changes; those changes were not made',
  'Training targets reflect stochastic policy-conditioned outcomes, not solved game-theoretic values']}
(E/'sigma4-value-residual-onnx-export-20261106.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print('PASS ONNX EXPORT',json.dumps(manifest,indent=2))
