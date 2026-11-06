import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2),native=args.includes('--native'),base=args.find(x=>x.startsWith('--base='))?.slice(7)||'/';
if(!native)execFileSync(process.execPath,['scripts/prepare-web.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit',env:{...process.env,VITE_BROWSER_AI:native?'0':'1',VITE_BASE_PATH:base}});
