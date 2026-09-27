import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {WindowsOcrProvider} from '../documents/OcrProvider.js';
const exec=promisify(execFile);
export async function captureWindow(){
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./capture-window.ps1',import.meta.url))],{windowsHide:true,timeout:10000,maxBuffer:4000000});
  return JSON.parse(stdout.replace(/^\uFEFF/,''));
}
export class LightPerception {
  constructor({capture=captureWindow,ocr=new WindowsOcrProvider(),now=Date.now}={}){Object.assign(this,{capture,ocr,now});this.last=new Map();this.current=null;this.lastCapture=-Infinity;this.error=null;this.categories=new Map();}
  async observe(activity,{force=false,periodic=false,vision=false}={}){
    const key=String(activity.process||'unknown').toLowerCase().replace(/\.exe$/,''),at=this.now();
    if(periodic&&activity.idleMs>=300000)return {skipped:true,reason:'使用者暫時離開，不擷取畫面。'};
    if(at-(this.last.get(key)??-Infinity)<600000||periodic&&at-this.lastCapture<600000)return {skipped:true,reason:'畫面觀察間隔至少 10 分鐘。'};
    if(!force&&!periodic && activity.title?.trim())return {skipped:true,reason:'視窗標題已足夠。'};
    this.last.set(key,at);if(this.last.size>100)this.last.delete(this.last.keys().next().value);
    this.lastCapture=at;
    try{
    const image=await this.capture();
    if(String(image.process||'').toLowerCase().replace(/\.exe$/,'')!==key)return {skipped:true,reason:'擷取時前景程式已切換，略過這次觀察。'};
    const result=vision&&this.vision?await this.vision.observe(image):await this.ocr.recognize(Buffer.from(image.image,'base64'));
    const text=(result.text||'').slice(0,1200),category=result.category||(/程式|function|import|class\s|const\s/.test(text)?'coding':/畫筆|brush|layer|圖層/i.test(text)?'art':/document|文件|段落|字型/i.test(text)?'document':'unknown');
    const changed=this.categories.get(key)!==category;this.categories.set(key,category);if(this.categories.size>100)this.categories.delete(this.categories.keys().next().value);
    this.error=null;this.current={process:image.process,text,category,visualSummary:result.summary,confidence:result.confidence,changed,at,width:640,height:360};return this.current;
    }catch(e){this.error=e.message;throw e;}
  }
  context(activity){const s=this.current;return s&&this.now()-s.at<600000&&String(s.process).toLowerCase().replace(/\.exe$/,'')===String(activity.process).toLowerCase().replace(/\.exe$/,'')?{category:s.category,at:s.at}:null;}
  status(){return {intervalMs:600000,lastCapture:Number.isFinite(this.lastCapture)?this.lastCapture:null,category:this.current?.category||null,observedAt:this.current?.at||null,error:this.error};}
}
