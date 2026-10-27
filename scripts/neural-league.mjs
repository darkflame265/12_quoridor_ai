import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const python=fileURLToPath(new URL(process.platform==='win32'?'../.venv-gpu/Scripts/python.exe':'../.venv-gpu/bin/python',import.meta.url));
if(!existsSync(python))throw Error('README의 GPU Python 환경을 먼저 설치하세요.');
const child=spawn(python,['training/league.py',...process.argv.slice(2)],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',windowsHide:true});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});
