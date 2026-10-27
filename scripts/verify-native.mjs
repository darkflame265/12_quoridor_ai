import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
const args=process.argv.slice(2),i=args.indexOf('--out'),out=i<0?`reports/native-runs/${new Date().toISOString().replace(/[:.]/g,'-')}`:args[i+1];
if(!out)throw Error('Missing output directory');await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{recursive:false});
async function run(file,args=[]){const child=spawn(process.execPath,[file,...args],{stdio:'inherit',windowsHide:true});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)throw Error(`검증 실패: ${file} (종료 코드 ${code})`);}
await run('scripts/build-native.mjs');
for(const [split,pairs] of [['validation',3],['holdout',4]])await run('scripts/evaluate-native.mjs',['--split',split,'--pairs',String(pairs),'--ms','500','--cores','4','--out',path.join(out,split)]);
await run('scripts/promote-native.mjs',['--validation',path.join(out,'validation/report.json'),'--holdout',path.join(out,'holdout/report.json'),...(args.includes('--apply')?['--apply']:[])]);
console.log(args.includes('--apply')?'승격 기준 통과: 네이티브 서비스를 재시작하면 검증된 후보를 사용합니다.':'승격 기준 통과: --apply로 다시 평가하면 기본 엔진 반영까지 진행합니다.');
