import {parentPort,workerData} from 'node:worker_threads';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
function recognize(image,page) {
  return new Promise((resolve,reject)=>{
    parentPort.once('message',result=>result.error?reject(Error(result.error)):resolve(result.result));
    parentPort.postMessage({type:'ocr',image,page});
  });
}
let task;
try {
  const assets=path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json'))).replaceAll('\\','/');
  task=getDocument({data:new Uint8Array(workerData),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,verbosity:0,maxImageSize:16000000,
    cMapUrl:assets+'/cmaps/',cMapPacked:true,
    standardFontDataUrl:assets+'/standard_fonts/',wasmUrl:assets+'/wasm/'});
  const pdf=await task.promise;
  if(pdf.numPages>50)throw Error('目前 PDF 上限 50 頁，請拆成較小的文件。');
  const pages=[];let characters=0;
  for(let number=1;number<=pdf.numPages;number++) {
    const page=await pdf.getPage(number),content=await page.getTextContent();
    let text=content.items.map(i=>(i.str||'')+(i.hasEOL?'\n':' ')).join('').trim();
    let source='text',language;
    // Sparse pages may be scans with an existing page number/header. Dense native
    // text keeps its exact extraction; OCR is never applied to the whole document blindly.
    const sparse=text.replace(/\s/g,'').length<80;
    const operators=sparse ? await page.getOperatorList() : null;
    const hasImage=operators?.fnArray.some(op=>[OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject].includes(op));
    if(!text || (sparse && hasImage)) {
      const base=page.getViewport({scale:1}),scale=Math.min(2.5,2200/Math.max(base.width,base.height),Math.sqrt(4000000/(base.width*base.height)));
      const viewport=page.getViewport({scale});
      const target=pdf.canvasFactory.create(Math.max(1,Math.ceil(viewport.width)),Math.max(1,Math.ceil(viewport.height)));
      try {
        parentPort.postMessage({type:'progress',page:number,total:pdf.numPages});
        await page.render({canvasContext:target.context,viewport,background:'rgb(255,255,255)'}).promise;
        const result=await recognize(target.canvas.toBuffer('image/png'),number);
        if(result.text.trim()){text=result.text.trim();source='ocr';language=result.language;}
        else source=text?'text-with-unreadable-image':'unreadable';
      }finally{pdf.canvasFactory.destroy(target);}
    }
    characters+=text.length;
    if(characters>250000)throw Error('文件文字超過 25 萬字，請拆成較小文件。');
    pages.push({number,text,source,...(language?{language}:{})});page.cleanup();
  }
  if(!pages.some(p=>p.text.trim()))throw Error('這份 PDF 經 OCR 後仍沒有可辨識文字，請提供更清晰的掃描文件。');
  parentPort.postMessage({pages});
}catch(e){parentPort.postMessage({error:e.name==='PasswordException'?'PDF 有密碼，請先提供未加密版本。':e.message});}
finally{await task?.destroy();}
