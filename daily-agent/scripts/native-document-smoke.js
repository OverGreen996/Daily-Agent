import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pdfFixture,scannedPdfFixture,longPdfFixture} from '../tests/pdf-fixture.js';
import {documentParts} from '../documents/DocumentSummarizer.js';
const useOcr=process.argv.includes('--ocr'),useSummary=process.argv.includes('--summary');
const root=path.resolve('..'),output=path.resolve('test-output/native-'+(useSummary?'summary':useOcr?'ocr':'document')+'-'+Date.now());
fs.mkdirSync(output,{recursive:true});
const base='http://127.0.0.1:3216',dataDir=path.join(output,'data'),fixture=path.join(output,'project.pdf');
fs.mkdirSync(dataDir,{recursive:true});
const scan=useOcr?await scannedPdfFixture():null;
fs.writeFileSync(fixture,useSummary?longPdfFixture():scan?.pdf||pdfFixture());if(scan)fs.writeFileSync(path.join(output,'scan-fixture.png'),scan.png);
fs.writeFileSync(path.join(dataDir,'environment-settings.json'),JSON.stringify({perception:false,lightLookup:false,weatherEnabled:false}));
const server=spawn(process.execPath,['server.js'],{windowsHide:true,env:{...process.env,DAILY_PORT:'3216',DAILY_DATA:dataDir},stdio:'pipe'});
let token,report={},errors='';server.stdout.resume();server.stderr.on('data',data=>errors+=data.toString());
async function api(route,data){
  const r=await fetch(base+'/api/'+route,{method:data?'POST':'GET',headers:{'x-daily-token':token,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  const result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result;
}
try{
  for(let i=0;i<60;i++){try{const r=await fetch(base);if(r.ok){token=(await r.text()).match(/name="daily-token" content="([a-f0-9]+)"/)[1];break}}catch{}await new Promise(r=>setTimeout(r,250))}
  assert.ok(token,'Server startup failed');await api('idle',{});
  const exe=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'daily-agent/desktop/Build-Pet.ps1')],{windowsHide:true,encoding:'utf8'}).trim().split(/\r?\n/).at(-1);
  await new Promise((resolve,reject)=>{
    const pet=spawn(exe,[root,base,'--document-test',output,fixture,...(useSummary?['--summary']:[])],{windowsHide:true,stdio:'ignore'});
    const timer=setTimeout(()=>{pet.kill();reject(Error('Native document test timed out'))},600000);
    pet.once('error',e=>{clearTimeout(timer);reject(e)});pet.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Native exit '+code))});
  });
  report=JSON.parse(fs.readFileSync(path.join(output,'native-document-test.json')));assert.equal(report.passed,true,report.error);
  const history=await api('history'),questions=history.filter(m=>m.role==='user'),replies=history.filter(m=>m.role==='assistant');
  assert.equal(questions.length,2);assert.equal(replies.length,2);
  const attachments=questions.map(m=>JSON.parse(m.extra));assert.equal(attachments[0].document_id,attachments[1].document_id);
  const raw=path.join(dataDir,'documents',attachments[0].document_id);
  assert.deepEqual(fs.readFileSync(raw),fs.readFileSync(fixture));
  const document=JSON.parse(fs.readFileSync(raw+'.json'));assert.equal(document.pages.length,useSummary?12:2);
  if(useSummary){
    assert.equal(report.summaryProgressSeen,true);
    assert.doesNotMatch(report.answer,/基於\s*OCR|OCR\s*識別|OCR\s*辨識|辨識限制/);
    const cacheDir=path.join(dataDir,'documents','summaries'),cacheFile=path.join(cacheDir,fs.readdirSync(cacheDir).find(n=>n.endsWith('.json')));
    const before=fs.readFileSync(cacheFile,'utf8'),cache=JSON.parse(before);
    assert.equal(cache.notes.length,documentParts(document).length);
    assert.deepEqual([...new Set(cache.notes.flatMap(n=>n.ranges.map(r=>r.page)))].sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i+1));
    report.partsRead=cache.notes.length;report.pagesRead=12;
    await api('chat',{text:'請完整摘要這份文件，簡短列出三個里程碑代碼。'});
    assert.equal(fs.readFileSync(cacheFile,'utf8'),before);report.summaryCacheReused=true;
  }
  if(useOcr){
    assert.equal(document.pages[0].source,'text');assert.equal(document.pages[1].source,'ocr');
    assert.match(document.pages[1].text,/攜帶設計圖/);assert.equal(report.ocrProgressSeen,true);
    report.ocrText=document.pages[1].text;report.ocrLanguage=document.pages[1].language;
  }
  report.rawPreserved=true;report.followupProvenanceSaved=true;
}catch(e){report.passed=false;report.error=e.stack;process.exitCode=1}
finally{
  if(token)await api('shutdown',{}).catch(()=>server.kill());else server.kill();
  if(server.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{server.kill();resolve()},10000);server.once('exit',()=>{clearTimeout(timer);resolve()})});
  report.modelsAfter=(await(await fetch('http://127.0.0.1:11435/api/ps')).json()).models;
  if(report.modelsAfter.length){report.passed=false;process.exitCode=1}
  report.serverErrors=errors;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({output,...report}));
}
