import {execFileSync,spawn} from 'node:child_process';
execFileSync(process.execPath,['scripts/prepare-web.mjs'],{stdio:'inherit'});
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,VITE_BROWSER_AI:'1'},windowsHide:true});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill());
child.on('exit',code=>{process.exitCode=code??0;});
