import {spawn} from 'node:child_process';
import {existsSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),python=fileURLToPath(new URL(process.platform==='win32'?'../.venv-gpu/Scripts/python.exe':'../.venv-gpu/bin/python',import.meta.url));
const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const out=get('--out','training/runs/rescnn-local'),rounds=Number(get('--rounds',4)),games=Number(get('--games',32)),simulations=Number(get('--simulations',32)),resume=args.includes('--resume');
if(!existsSync(python))throw Error('README의 GPU 환경을 먼저 설치하세요.');
if(!out||![rounds,games,simulations].every(n=>Number.isInteger(n)&&n>0))throw Error('학습 회차·대국 수·탐색 횟수는 양의 정수여야 합니다.');
if(!resume&&existsSync(path.resolve(root,out))&&readdirSync(path.resolve(root,out)).length)throw Error('새 출력 폴더를 지정하거나 --resume을 사용하세요.');
async function run(parameters){const child=spawn(python,parameters,{cwd:root,stdio:'inherit',windowsHide:true});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)throw Error(`CNN 학습 단계가 실패했습니다. 종료 코드: ${code}`);}
await run(['-c','import torch; assert torch.cuda.is_available(), "CUDA GPU is unavailable"']);
if(!resume)await run(['training/train.py','--architecture','rescnn','--channels','64','--blocks','4','--replay-dir','reports/gpu-batch/dataset-smoke','--validation-fraction','0.2','--games','0','--iterations','1','--epochs','12','--batch-size','64','--lr','0.001','--simulations','16','--arena-bootstrap','0','--arena-pairs','1','--arena-ms','20','--max-plies','120','--out',out,'--champion','models/bootstrap-checkpoint.pt','--deterministic']);
await run(['training/train.py','--architecture','rescnn','--resume',path.join(out,'checkpoint.pt'),'--out',out,'--selfplay-backend','batched','--games',String(games),'--parallel-games','16','--rules-workers','2','--inference-batch','64','--simulations',String(simulations),'--max-plies','160','--iterations',String(rounds),'--epochs','4','--batch-size','64','--lr','0.0003','--arena-bootstrap','0','--arena-pairs','2','--arena-ms','20','--evaluation-interval','2']);
console.log(`학습 완료: ${out}/report.json — 실전 엔진 반영은 별도 강도 검증이 필요합니다.`);
