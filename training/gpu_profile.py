"""Measure the existing small network; does not activate a gameplay model."""
import json,time,platform
from pathlib import Path
import torch
from train import PolicyValue,FEATURES

torch.set_num_threads(2)
saved=torch.load('models/bootstrap-checkpoint.pt',map_location='cpu',weights_only=True)
report={'torch':torch.__version__,'python':platform.python_version(),'cuda':torch.version.cuda,'gpu':torch.cuda.get_device_name(0),'batches':[]}
for batch in [1,16,64,256]:
    x=torch.randn(batch,FEATURES); predictions={}; row={'batch':batch}
    for device in ['cpu','cuda']:
        model=PolicyValue(saved['hidden']).to(device).eval();model.load_state_dict(saved['model']);data=x.to(device)
        def sync():
            if device=='cuda':torch.cuda.synchronize()
        with torch.no_grad():
            for _ in range(20):model(data)
            sync();start=time.perf_counter()
            for _ in range(200):p,v=model(data)
            sync();row[device+'Ms']=(time.perf_counter()-start)*1000/200
            predictions[device]=(p.cpu(),v.cpu())
    row['maxError']=max(float((a-b).abs().max()) for a,b in zip(predictions['cpu'],predictions['cuda']));assert row['maxError']<1e-4
    report['batches'].append(row)
model.train();optimizer=torch.optim.Adam(model.parameters());before=model.policy.weight.detach().clone()
for _ in range(3):
    optimizer.zero_grad();p,v=model(data);loss=p.square().mean()+v.square().mean();loss.backward();optimizer.step()
torch.cuda.synchronize();assert not torch.equal(before,model.policy.weight)
report['trainingStepPassed']=True;report['peakAllocatedBytes']=torch.cuda.max_memory_allocated()
Path('reports/fast-engine/gpu-profile.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
