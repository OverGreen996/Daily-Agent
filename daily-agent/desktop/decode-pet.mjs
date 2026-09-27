// Local WebP -> PNG decode only. No uploads, scripts from archives, or image edits.
import fs from 'node:fs';
import { chromium } from 'playwright';
const [input,output]=process.argv.slice(2);
if(!input || !output || fs.statSync(input).size>32*1024*1024) throw Error('Invalid image input');
const bytes=fs.readFileSync(input);
let browser,deadline;
try {
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu'],timeout:15000});
  const page=await browser.newPage();
  await page.route('**/*',route=>route.abort());
  const png=await Promise.race([page.evaluate(async data=>{
    const image=new Image(); image.src='data:image/webp;base64,'+data; await image.decode();
    if(image.width<1 || image.height<1 || image.width>8192 || image.height>8192 || image.width*image.height>16777216) throw Error('Image dimensions too large');
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    canvas.getContext('2d').drawImage(image,0,0);
    return canvas.toDataURL('image/png').split(',')[1];
  },bytes.toString('base64')),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('Image decode timed out')),20000)})]);
  fs.writeFileSync(output,Buffer.from(png,'base64'));
} finally { clearTimeout(deadline);await browser?.close(); }
