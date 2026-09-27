import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export class OcrProvider {
  async recognize(_png,_options={}){throw Error('OCR provider is not implemented');}
}

export class WindowsOcrProvider extends OcrProvider {
  async recognize(png,{signal}={}) {
    if(process.platform!=='win32')throw Error('掃描 PDF 目前需要 Windows OCR。');
    if(signal?.aborted)throw Error('OCR 已取消。');
    if(png.length>20*1024*1024)throw Error('OCR 圖片過大。');
    return new Promise((resolve,reject)=>{
      const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./windows-ocr.ps1',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      let output='',settled=false;
      const finish=(error,result)=>{
        if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);
        if(child.exitCode===null)child.kill();error?reject(error):resolve(result);
      };
      const cancel=()=>finish(Error('OCR 已取消。'));
      const timer=setTimeout(()=>finish(Error('單頁 OCR 逾時，請提供更清晰或較小的文件。')),20000);
      signal?.addEventListener('abort',cancel,{once:true});
      child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{output+=chunk;if(output.length>1000000)finish(Error('OCR 輸出過大。'));});
      child.stderr.resume();child.stdin.on('error',e=>finish(e));child.on('error',e=>finish(e));
      child.on('close',code=>{
        if(settled)return;
        try {
          const result=JSON.parse(output.replace(/^\uFEFF/,''));
          if(code!==0 || result.error)throw Error(result.error||'OCR failed');
          if(typeof result.text!=='string')throw Error('Invalid OCR response');
          // Windows inserts spaces between CJK words; preserve English word spacing.
          result.text=result.text.replace(/(?<=[\p{Script=Han}]) +(?=[\p{Script=Han}])/gu,'');
          finish(null,result);
        }catch(e){finish(Error('Windows OCR 未完成：'+e.message));}
      });
      child.stdin.end(JSON.stringify({image:Buffer.from(png).toString('base64')}));
    });
  }
}
