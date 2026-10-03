import {GoogleDriveBackup,createSnapshot} from './GoogleDriveBackup.js';
export function create({config,memory}){
 const drive=new GoogleDriveBackup({dataDir:config.dataDir,clientId:config.googleDriveClientId,clientSecret:config.googleDriveClientSecret});
 let timer;
 const backup=agent=>drive.backup(()=>agent.exclusive(()=>createSnapshot(memory,config.dataDir)));
 return {
  attach(agent){timer=setInterval(()=>{
   if(drive.busy||drive.flow||drive.state.auto!==true)return;
   if(Date.now()-Date.parse(drive.state.last_backup_at||'1970-01-01')<86400000)return;
   try {if(!drive.status().connected)return;} catch(e){drive.error=e.message;return;}
   backup(agent).catch(()=>{});
  },3600000);timer.unref();},
  routes:[
   {method:'GET',path:'/',handle:()=>drive.status()},
   {method:'POST',path:'/configure',handle:data=>drive.configure(data.client)},
   {method:'POST',path:'/login',handle:()=>drive.login()},
   {method:'POST',path:'/auto',handle:data=>drive.setAuto(data.enabled)},
   {method:'POST',path:'/backup',handle:(_data,_context,agent)=>backup(agent)},
   {method:'GET',path:'/files',handle:()=>drive.list()},
   {method:'POST',path:'/download',handle:data=>drive.download(data.id)},
   {method:'POST',path:'/disconnect',handle:()=>drive.disconnect()},
  ],
  dispose(){clearInterval(timer);drive.close();},
 };
}
