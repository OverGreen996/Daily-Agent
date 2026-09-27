import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {MemoryPalace} from '../memory/MemoryPalace.js';
const output=path.resolve('test-output/palace-'+Date.now()),dataDir=path.join(output,'data');fs.mkdirSync(dataDir,{recursive:true});
const memory=new MemoryPalace(path.join(dataDir,'palace.sqlite'),{embed:async texts=>texts.map(()=>[1,0])});memory.working.add('user','桌寵要放在桌面，泡泡在有空間的位置顯示。完整原文檢查標記：PALACE731。','桌寵介面');memory.working.add('user','換一個主題。','新話題');await memory.flush({force:true});memory.close();
const server=spawn(process.execPath,['server.js'],{windowsHide:true,env:{...process.env,DAILY_PORT:'3219',DAILY_DATA:dataDir},stdio:'pipe'});server.stdout.resume();let errors='';server.stderr.on('data',c=>errors+=c);let token,browser,report={};const base='http://127.0.0.1:3219';
async function api(route,data){const r=await fetch(base+'/api/'+route,{method:data?'POST':'GET',headers:{'x-daily-token':token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
try{
  for(let i=0;i<60;i++){try{const html=await(await fetch(base)).text();token=html.match(/name="daily-token" content="([a-f0-9]+)"/)[1];break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(token);await api('settings',{perception:false,lightLookup:false});
  const ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:ui-test\r\nDTSTART:20260928T030000Z\r\nDTEND:20260928T040000Z\r\nSUMMARY:行事曆匯入驗證\r\nEND:VEVENT\r\nEND:VCALENDAR';
  assert.match((await api('chat',{text:'匯入行事曆',document:{name:'test.ics',data:Buffer.from(ics).toString('base64')}})).content,/已匯入/);
  assert.match((await api('chat',{text:'記住偏好：請叫我小林'})).content,/記住|保存|儲存/);
  assert.match((await api('chat',{text:'記住偏好：請叫我小陳'})).content,/衝突/);
  await api('idle',{});
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu']});const page=await browser.newPage({viewport:{width:1150,height:820}});const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));await page.goto(base+'/palace');await page.waitForSelector('.book');assert.equal(await page.locator('.book').count(),1);await page.screenshot({path:path.join(output,'bookshelf.png')});
  await page.locator('.book').click();await page.waitForFunction(()=>document.querySelector('pre')?.textContent.includes('PALACE731'));await page.screenshot({path:path.join(output,'book-raw.png')});assert.equal(pageErrors.length,0);assert.equal((await api('status')).models.length,0);
  report={passed:true,icsImport:true,pinConflict:true,bookshelf:true,rawConversation:true,noGpuModel:true};
}catch(e){report={passed:false,error:e.stack};process.exitCode=1;}
finally{await browser?.close();if(token)await api('shutdown',{}).catch(()=>server.kill());else server.kill();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({...report,errors},null,2));console.log({output,...report});}
