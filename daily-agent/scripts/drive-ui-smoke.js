import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const data=path.resolve('test-output/drive-ui-'+Date.now());fs.mkdirSync(data,{recursive:true});
fs.writeFileSync(path.join(data,'modules.json'),JSON.stringify({enabled:{environment:false,mobile:false,images:false,companion:false}}));
const mock=http.createServer((_req,res)=>{res.setHeader('content-type','application/json');res.end('{"models":[]}');});
await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
const reserve=http.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const child=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,DAILY_PORT:String(port),DAILY_DATA:data,DAILY_GOOGLE_CLIENT_ID:'',DAILY_GOOGLE_CLIENT_SECRET:'',OLLAMA_HOST_URL:`http://127.0.0.1:${mock.address().port}`},windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='',browser;child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
try {
 const base=`http://127.0.0.1:${port}`;
 for(let i=0;i<100;i++){try {if((await fetch(base)).ok)break;} catch {}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:850,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/palace#drive-backup');
 await page.getByText('尚未設定 OAuth 用戶端，請先看下方教學。',{exact:true}).waitFor();
 assert.equal(await page.locator('#drive-login').isDisabled(),true);
 assert.equal(await page.locator('#drive-now').isDisabled(),true);
 assert.equal(await page.locator('#drive-backup').evaluate(el=>el.open),true);
 await page.screenshot({path:'test-output/drive-backup-desktop.png',fullPage:true});
 const client={installed:{client_id:'1234567890-desktop.apps.googleusercontent.com',client_secret:'synthetic-local-test'}};
 await page.locator('#drive-client').setInputFiles({name:'test-client.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(client))});
 await page.getByText('用戶端已加密保存在本機，可以登入 Google。',{exact:true}).waitFor();
 assert.equal(await page.locator('#drive-login').isEnabled(),true);
 assert.equal(await page.locator('#drive-now').isDisabled(),true);
 assert.doesNotMatch(await page.locator('body').innerText(),/synthetic-local-test/);
 await page.setViewportSize({width:390,height:900});
 await page.screenshot({path:'test-output/drive-backup-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 const report={passed:true,configure:true,noPrematureBackup:true,noSecretsInPage:true,responsive:true};
 fs.writeFileSync(path.join(data,'report.json'),JSON.stringify(report,null,2));console.log(report);
} finally {
 await browser?.close();child.kill();await new Promise(resolve=>mock.close(resolve));fs.writeFileSync(path.join(data,'server.log'),log);
}
