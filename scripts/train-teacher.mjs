import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const python=fileURLToPath(new URL(process.platform==='win32'?'../.venv-gpu/Scripts/python.exe':'../.venv-gpu/bin/python',import.meta.url));
const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const out=get('--out','training/runs/teacher-local'),dataset=get('--dataset',path.join(out,'dataset'));
if(!existsSync(python))throw Error('README의 GPU Python 환경을 먼저 설치하세요.');
async function run(parameters){const child=spawn(python,parameters,{cwd:root,stdio:'inherit',windowsHide:true});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)throw Error(`지도 학습 단계가 실패했습니다. 종료 코드: ${code}`);}
await run(['-c','import torch; assert torch.cuda.is_available(), "CUDA GPU is unavailable"']);
if(!args.includes('--dataset'))await run(['training/teacher.py','collect','--out',dataset,'--games',get('--games','32'),'--ms',get('--teacher-ms','30'),'--cores','4',...(args.includes('--resume-data')?['--resume']:[])]);
await run(['training/teacher.py','fit','--dataset',dataset,'--out',path.join(out,'fit'),'--epochs',get('--epochs','20'),'--checkpoint',get('--checkpoint','models/experimental-rescnn/experimental.pt')]);
await run(['training/teacher.py','export','--run',path.join(out,'fit'),'--out',path.join(out,'experimental')]);
console.log(`지도 학습 완료: ${out}. 실전 반영 전 동일 시간 리그 평가가 필요합니다.`);
