import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),python=fileURLToPath(new URL(process.platform==='win32'?'../.venv-gpu/Scripts/python.exe':'../.venv-gpu/bin/python',import.meta.url));
if(!existsSync(python))throw Error('GPU 환경이 없습니다. README의 GPU 배치 자가대국 설치 절차를 먼저 실행하세요.');
const child=spawn(python,['training/batch_selfplay.py','--device','cuda',...process.argv.slice(2)],{cwd:root,stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
