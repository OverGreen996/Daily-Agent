const driveToken=document.querySelector('meta[name="daily-token"]').content;
const $=selector=>document.querySelector(selector);
const driveMessage=$('#drive-message');let busy=false,poll;
async function driveApi(route='',body){
 const response=await fetch('/api/modules/backup'+route,{method:body===undefined?'GET':'POST',headers:{'x-daily-token':driveToken,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json();if(!response.ok)throw Error(data.error||'備份模組無法使用。');return data;
}
async function driveStatus(){
 try {
  const status=await driveApi();
  $('#drive-status').textContent=(status.connected?'已登入 '+(status.email||'Google 帳號'):status.configured?'尚未登入 Google':'尚未設定 OAuth 用戶端，請先看下方教學。')+
   (status.login_pending?' · 請在 Google 視窗完成登入':'')+(status.busy?' · 備份作業進行中':'')+
   (status.last_backup_at?' · 最近備份 '+new Date(status.last_backup_at).toLocaleString('zh-TW'):'')+(status.error?' · '+status.error:'');
  $('#drive-auto').checked=status.auto;$('#drive-auto').disabled=busy||status.busy||status.login_pending;
  $('#drive-login').disabled=busy||!status.configured||status.login_pending||status.busy;
  $('#drive-now').disabled=busy||!status.connected||status.login_pending||status.busy;
  $('#drive-list').disabled=$('#drive-now').disabled;
  $('#drive-disconnect').disabled=busy||(!status.connected&&!status.login_pending);
  $('#drive-client').disabled=busy||status.connected||status.login_pending||status.busy;
  if(!status.configured)$('#drive-setup').open=true;
  if(!status.login_pending&&poll){clearInterval(poll);poll=null;}
 } catch(e){$('#drive-status').textContent=e.message;for(const button of $('#drive-backup').querySelectorAll('button,input'))button.disabled=true;}
}
async function action(fn){
 if(busy)return;busy=true;driveMessage.textContent='處理中…';await driveStatus();
 try {await fn();} catch(e){driveMessage.textContent=e.message;} finally {busy=false;await driveStatus();}
}
$('#drive-login').addEventListener('click',()=>{
 const popup=window.open('about:blank','daily-google-login');
 if(popup)popup.opener=null;
 action(async()=>{try {
  const {url}=await driveApi('/login',{});const target=new URL(url);
  if(target.origin!=='https://accounts.google.com')throw Error('Google 登入網址不正確。');
  if(popup)popup.location.href=url;
  else {const link=document.createElement('a');link.href=url;link.textContent='開啟 Google 登入';link.target='_blank';link.rel='noopener';driveMessage.replaceChildren(link);}
  if(popup)driveMessage.textContent='請在 Google 視窗選帳號並同意備份權限。';
  poll=setInterval(driveStatus,1500);
 } catch(e){popup?.close();throw e;}});
});
$('#drive-client').addEventListener('change',()=>action(async()=>{
 const file=$('#drive-client').files[0];if(!file)return;
 if(file.size>32768)throw Error('用戶端 JSON 太大，請確認檔案。');
 await driveApi('/configure',{client:JSON.parse(await file.text())});$('#drive-client').value='';driveMessage.textContent='用戶端已加密保存在本機，可以登入 Google。';
}));
$('#drive-now').addEventListener('click',()=>action(async()=>{
 const result=await driveApi('/backup',{});driveMessage.textContent='已備份到自己的 Drive：'+result.name;
}));
$('#drive-auto').addEventListener('change',event=>{const enabled=event.target.checked;action(async()=>{await driveApi('/auto',{enabled});driveMessage.textContent=enabled?'已開啟每日備份；電腦開著並保持登入時，每小時檢查一次。':'已關閉自動備份。';});});
$('#drive-disconnect').addEventListener('click',()=>action(async()=>{const result=await driveApi('/disconnect',{});$('#drive-files').replaceChildren();driveMessage.textContent=result.message;}));
$('#drive-list').addEventListener('click',()=>action(async()=>{
 const result=await driveApi('/files');const list=$('#drive-files');list.replaceChildren();
 for(const file of result.files){
  const row=document.createElement('p'),label=document.createElement('span'),download=document.createElement('button');
  label.textContent=new Date(file.created_at).toLocaleString('zh-TW')+' · '+Math.round(file.size/1024)+' KB ';
  download.textContent='下載並校驗';download.addEventListener('click',()=>action(async()=>{
   const result=await driveApi('/download',{id:file.id});driveMessage.textContent=result.message+'\n存放位置：'+result.path;
  }));row.append(label,download);list.append(row);
 }
 driveMessage.textContent=result.files.length?'已列出最近 '+result.files.length+' 份備份。':'還沒有備份，請按「立即備份」。';
}));
$('#drive-backup').addEventListener('toggle',()=>{if($('#drive-backup').open)driveStatus();});
window.addEventListener('pagehide',()=>clearInterval(poll));
if(location.hash==='#drive-backup')$('#drive-backup').open=true;
driveStatus();
