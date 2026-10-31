import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,open,unlink,stat} from 'node:fs/promises';
const execute=promisify(execFile);
export async function inspectLauncherProcess(pid){
 if(process.platform!=='win32')return null;
 const command=`$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if($p){[pscustomobject]@{name=$p.Name;commandLine=$p.CommandLine;startedAt=([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds()}|ConvertTo-Json -Compress}`;
 try{const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:5000,maxBuffer:32768});return stdout.trim()?JSON.parse(stdout):null;}catch{return null;}
}
// PID existence alone is insufficient: Windows can reuse it for another app.
// An inaccessible process is unknown, never assumed to be our launcher.
export async function leaseOwner(state,{inspect=inspectLauncherProcess,probe=pid=>process.kill(pid,0),root=''}={}){
 if(!Number.isSafeInteger(state?.pid)||state.pid<=0)return 'unknown';
 try{probe(state.pid);}catch(error){if(error.code==='ESRCH')return 'dead';}
 const info=await inspect(state.pid);if(!info)return 'unknown';
 if(!/^node(?:\.exe)?$/i.test(info.name??''))return 'mismatch';
 if(state.processStartedAt&&Number.isFinite(info.startedAt)&&Math.abs(state.processStartedAt-info.startedAt)>4000)return 'mismatch';
 const line=(info.commandLine??'').replaceAll('\\','/').toLowerCase(),prefix=root.replaceAll('\\','/').replace(/\/$/,'').toLowerCase();
 if(line.includes(prefix+'/scripts/play.mjs')||/(?:^|[\s"'])scripts\/play\.mjs(?:[\s"']|$)/.test(line))return 'owned';
 if(line)return 'mismatch';
 return state.processStartedAt&&Number.isFinite(info.startedAt)?'owned':'unknown';
}
// Serialize stale-file cleanup and re-read after taking the cleanup guard, so
// a second launcher cannot delete a newer owner's ready/starting state.
export async function removeUnchangedLease(file,expected){
 const guard=file+'.recovery';let handle;
 try{handle=await open(guard,'wx');}
 catch(error){if(error.code!=='EEXIST')throw error;try{if(Date.now()-(await stat(guard)).mtimeMs>30000)await unlink(guard);}catch{}return false;}
 try{
  let current;try{current=JSON.parse(await readFile(file,'utf8'));}catch{return false;}
  if(JSON.stringify(current)!==JSON.stringify(expected))return false;
  await unlink(file);return true;
 }catch(error){if(error.code==='ENOENT')return false;throw error;}
 finally{await handle.close();await unlink(guard).catch(()=>{});}
}
