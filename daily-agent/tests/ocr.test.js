import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {extractPDF,DocumentStore,selectDocumentContext} from '../documents/DocumentStore.js';
import {pdfFixture,scannedPdfFixture} from './pdf-fixture.js';
import {WindowsOcrProvider} from '../documents/OcrProvider.js';

test('native PDF text never starts OCR',async()=>{
  const pages=await extractPDF(pdfFixture(),{ocr:{recognize(){throw Error('Must not call OCR')}}});
  assert.ok(pages.every(p=>p.source==='text'));assert.match(pages[1].text,/LANTERN-742/);
});
test('mixed scan with a native header uses OCR only on sparse image page and preserves provenance',async()=>{
  const {pdf}=await scannedPdfFixture({header:'Page 2'});let calls=0;const progress=[];
  const pages=await extractPDF(pdf,{ocr:{async recognize(image){calls++;assert.ok(image.length>1000);return {text:'掃描文字 LANTERN-742',language:'zh-Hant-TW'}}},onProgress:p=>progress.push(p)});
  assert.equal(calls,1);assert.equal(pages[0].source,'text');assert.equal(pages[1].source,'ocr');
  assert.equal(pages[1].number,2);assert.equal(progress[0].page,2);
  const context=selectDocumentContext({pages,format:'pdf',name:'scan.pdf'},'第2頁');
  assert.deepEqual(context.ocr_pages,[2]);assert.equal(context.selected[0].source,'ocr');
});
test('empty OCR page in a mixed PDF is disclosed as unreadable, not silently treated as complete',async()=>{
  const {pdf}=await scannedPdfFixture();
  const pages=await extractPDF(pdf,{ocr:{async recognize(){return {text:'',language:'en-US'}}}});
  const context=selectDocumentContext({pages,format:'pdf',name:'scan.pdf'},'摘要');
  assert.deepEqual(context.unreadable_pages,[2]);assert.equal(context.partial,true);
});
test('OCR failure saves no incomplete document; bounded timeout aborts active OCR provider',async t=>{
  const {pdf}=await scannedPdfFixture(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'daily-ocr-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const store=new DocumentStore(dir,{ocr:{async recognize(){throw Error('Missing OCR language')}}});
  await assert.rejects(store.ingest({name:'scan.pdf',data:pdf.toString('base64')}),/Missing OCR/);
  assert.deepEqual(await fs.readdir(store.dir).catch(()=>[]),[]);
  let aborted=false;
  await assert.rejects(extractPDF(pdf,{timeoutMs:1500,ocr:{recognize(_image,{signal}){return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('cancelled'))},{once:true}));}}}),/逾時/);
  assert.equal(aborted,true);
});
test('real installed Windows OCR reads Traditional Chinese and English and cached document avoids second OCR',{skip:process.platform!=='win32'},async t=>{
  const {pdf}=await scannedPdfFixture();const dir=await fs.mkdtemp(path.join(os.tmpdir(),'daily-ocr-real-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  let calls=0;const provider=new WindowsOcrProvider(),store=new DocumentStore(dir,{ocr:{recognize(...args){calls++;return provider.recognize(...args);}}});
  const input={name:'scan.pdf',data:pdf.toString('base64')},doc=await store.ingest(input);
  assert.match(doc.pages[1].text,/LANTERN-742/);assert.match(doc.pages[1].text,/攜帶設計圖/);
  assert.equal(doc.pages[1].language,'zh-Hant-TW');assert.equal(doc.pages[1].source,'ocr');
  await store.ingest(input);assert.equal(calls,1);
  assert.deepEqual(await fs.readFile(path.join(store.dir,doc.id)),pdf);
});
