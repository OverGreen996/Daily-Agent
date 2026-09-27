import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {tokens,lexical} from '../memory/MemoryPalace.js';
import {WindowsOcrProvider} from './OcrProvider.js';
import {DocumentLibrary} from './DocumentLibrary.js';

export function extractPDF(bytes,{ocr=new WindowsOcrProvider(),onProgress=()=>{},timeoutMs=120000}={}) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./pdf-worker.js',import.meta.url),{workerData:bytes,resourceLimits:{maxOldGenerationSizeMb:192}});
    let settled=false;const controller=new AbortController();
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);controller.abort();worker.terminate();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(Error('PDF 讀取／OCR 逾時，請拆成較小的文件。')),timeoutMs);
    worker.on('message',async r=>{
      if(settled)return;
      if(r.type==='progress'){try{onProgress({page:r.page,total:r.total,stage:'ocr'});}catch{}return;}
      if(r.type==='ocr') {
        try{const result=await ocr.recognize(r.image,{signal:controller.signal});if(!settled)worker.postMessage({result});}
        catch(e){finish(e);}
        return;
      }
      finish(r.error?Error(r.error):null,r.pages);
    });
    worker.once('error',e=>finish(e));
    worker.once('exit',()=>{if(!settled)finish(Error('PDF 解析程序未完成。'));});
  });
}

export function selectDocumentContext(document,query,budget=4200) {
  const chunks=[];
  for(const page of document.pages)for(let start=0;start<page.text.length;start+=650) {
    const text=page.text.slice(start,start+700);
    chunks.push({page:page.number,start,text,source:page.source||'text',label:document.format==='pdf'?`第 ${page.number} 頁`:`字元 ${start+1}–${start+text.length}`});
  }
  const pageMatch=query.match(/第\s*(\d+)\s*頁|\bpage\s+(\d+)/i);
  if(pageMatch && !document.pages.some(p=>p.number===Number(pageMatch[1]||pageMatch[2])))throw Error('文件沒有指定的頁碼。');
  const terms=[...new Set(lexical(query).split(' ').filter(Boolean))];
  // Common bilingual document fields: let a Chinese follow-up retrieve the
  // English source instead of depending on translated chat history.
  for(const [intent,aliases] of [
    [/日期|哪一天|什麼時候|何時/,['date','deadline']],
    [/代碼|編號/,['code','identifier']],
    [/預算|金額|費用|多少錢/,['budget','amount','cost']],
    [/負責人|作者/,['owner','author']],
  ])if(intent.test(query))terms.push(...aliases);
  const summary=/摘要|總結|概述|summari[sz]e|summary/i.test(query);
  const ranked=chunks.map((c,index)=>({...c,index,score:terms.reduce((n,t)=>n+(c.text.toLowerCase().includes(t)?(t.length>1?3:1):0),0)}));
  let candidates;
  if(pageMatch)candidates=ranked.filter(c=>c.page===Number(pageMatch[1]||pageMatch[2])).sort((a,b)=>b.score-a.score||a.index-b.index);
  else if(summary && chunks.length>6){
    const positions=new Set(Array.from({length:6},(_,i)=>Math.round(i*(chunks.length-1)/5)));
    candidates=[...ranked.filter(c=>positions.has(c.index)),...ranked.filter(c=>!positions.has(c.index))];
  }else candidates=ranked.sort((a,b)=>b.score-a.score||a.index-b.index);
  let used=0;const selected=[];
  for(const c of candidates){const cost=tokens(c.text);if(used+cost>budget)continue;selected.push(c);used+=cost;if(selected.length>=6)break;}
  selected.sort((a,b)=>a.index-b.index);
  return {name:document.name,document_id:document.id,pages:document.pages.length,
    ocr_pages:document.pages.filter(p=>p.source==='ocr').map(p=>p.number),
    unreadable_pages:document.pages.filter(p=>p.source?.includes('unreadable')).map(p=>p.number),
    partial:selected.length<chunks.length||document.pages.some(p=>p.source?.includes('unreadable')),
    selected:selected.map(({label,text,source})=>({label,text,source})),estimated_tokens:used};
}

export class DocumentStore {
  constructor(dataDir,{ocr=new WindowsOcrProvider(),embedding}={}){this.dir=path.join(dataDir,'documents');this.ocr=ocr;this.library=new DocumentLibrary(dataDir,embedding);}
  async saveMetadata(document){
    const target=path.join(this.dir,document.id+'.json'),temporary=target+'.'+randomUUID()+'.tmp';
    try{await fs.writeFile(temporary,JSON.stringify(document));await fs.rename(temporary,target);}finally{await fs.rm(temporary,{force:true});}
  }
  async ingest(input,{onProgress}={}){
    if(!input || typeof input.name!=='string' || typeof input.data!=='string')throw Error('文件附件格式錯誤。');
    const name=path.win32.basename(path.basename(input.name)).replace(/[\x00-\x1f]/g,'').slice(0,180),format=path.extname(name).slice(1).toLowerCase();
    if(!['txt','md','pdf'].includes(format))throw Error('目前支援 TXT、Markdown、PDF 文件。');
    if(!input.data.length || input.data.length>7000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))throw Error('文件資料無效或超過 5 MB。');
    const bytes=Buffer.from(input.data,'base64');
    if(!bytes.length || bytes.length>5*1024*1024)throw Error('文件必須介於 1 byte 與 5 MB。');
    const id=createHash('sha256').update(bytes).digest('hex')+'.'+format;
    const existing=await this.get(id);
    if(existing && (format!=='pdf'||existing.parser_version===2)){
      const aliases=[...new Set([existing.name,...(existing.aliases||[]),name])];
      if(JSON.stringify(aliases)!==JSON.stringify(existing.aliases)){existing.aliases=aliases;await this.saveMetadata(existing);}
      await this.library.index(existing);return {...existing,name};
    }
    let pages;
    if(format==='pdf') {
      if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('檔案不是有效的 PDF。');
      pages=await extractPDF(bytes,{ocr:this.ocr,onProgress});
    }else {
      let text;
      try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('文字檔請使用 UTF-8 編碼。');}
      if(text.includes('\0') || !text.trim())throw Error('文件不是可閱讀的純文字。');
      if(text.length>250000)throw Error('文件文字超過 25 萬字，請拆成較小文件。');
      pages=[{number:1,text}];
    }
    const document={id,name,format,pages,parser_version:2,created_at:new Date().toISOString()};
    await fs.mkdir(this.dir,{recursive:true});
    await fs.writeFile(path.join(this.dir,id),bytes);
    await this.saveMetadata(document);
    await this.library.index(document);
    return document;
  }
  async get(id){
    if(!/^[a-f\d]{64}\.(txt|md|pdf)$/.test(id||''))return null;
    try{return JSON.parse(await fs.readFile(path.join(this.dir,id+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
}
