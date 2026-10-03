import fs from 'node:fs';
import path from 'node:path';
import {runtimePath} from '../core/RuntimePaths.cjs';
let lastWrite=0;
export function setupProgress(title,event={},status){
 if(!status&&Date.now()-lastWrite<500&&event.status!=='success')return;
 lastWrite=Date.now();
 const root=runtimePath(),file=path.join(root,'download-progress.json');
 fs.mkdirSync(root,{recursive:true});
 const state={schema:1,title,status:status||(event.status==='success'?'complete':event.total?'downloading':'verifying'),completedBytes:event.completed||0,totalBytes:event.total||0,updatedAt:new Date().toISOString()};
 fs.writeFileSync(file+'.tmp',JSON.stringify(state));fs.renameSync(file+'.tmp',file);
}
