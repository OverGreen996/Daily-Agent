const {runtimePath}=require('../core/RuntimePaths.cjs');
const fs=require('fs');
const path=require('path');
const sherpa=require('sherpa-onnx-node');
const readline=require('readline');
const OpenCC=require('opencc-js');
const toSimplified=OpenCC.Converter({from:'tw',to:'cn'});

function wav16(samples,rate){
  const data=pcm16(samples),out=Buffer.alloc(44+data.length);
  out.write('RIFF',0);out.writeUInt32LE(36+data.length,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);
  out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);
  out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(data.length,40);data.copy(out,44);return out;
}
function pcm16(samples){const data=Buffer.alloc(samples.length*2);for(let i=0;i<samples.length;i++)data.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),i*2);return data;}
function inside(file,dir){const rel=path.relative(dir,file);return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel);}
const root=path.resolve(__dirname,'../..'),requestDir=runtimePath('tts-requests'),outDir=runtimePath('tts-output');
function createTts(){
  const model=runtimePath('tts','kokoro-multi-lang-v1_1');
  return new sherpa.OfflineTts({model:{kokoro:{model:path.join(model,'model.onnx'),voices:path.join(model,'voices.bin'),tokens:path.join(model,'tokens.txt'),dataDir:path.join(model,'espeak-ng-data'),lexicon:path.join(model,'lexicon-us-en.txt')+','+path.join(model,'lexicon-zh.txt')},debug:false,numThreads:4,provider:'cpu'},maxNumSentences:1});
}
async function generate(tts,request){
  const output=path.resolve(request.output||'');if(!inside(output,outDir)||path.extname(output).toLowerCase()!=='.wav')throw Error('Invalid output path');
  const raw=request.textBase64?Buffer.from(String(request.textBase64),'base64').toString('utf8'):String(request.text||'');
  const text=toSimplified(raw.replace(/[\u{1F000}-\u{1FAFF}～~]/gu,'').replace(/[？?]/g,'。').trim().slice(0,350)),sid=Number(request.sid);
  if(!text||text.includes('\uFFFD')||!Number.isInteger(sid)||sid<0||sid>102)throw Error('Invalid TTS request or text encoding');
  const started=Date.now();
  const generationConfig=new sherpa.GenerationConfig({sid,speed:Math.max(.7,Math.min(1.4,Number(request.speed)||1.05)),silenceScale:.2});
  const audio=await tts.generateAsync({text,generationConfig,onProgress:request.stream?(info)=>{const chunk=pcm16(info.samples);if(chunk.length)process.stdout.write(JSON.stringify({id:request.id,audio:chunk.toString('base64'),sampleRate:24000,progress:info.progress})+'\n');}:undefined});fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(output,wav16(audio.samples,audio.sampleRate));
  return {ok:true,id:request.id,ms:Date.now()-started,sampleRate:audio.sampleRate,samples:audio.samples.length,sid};
}
async function main(){
  if(process.argv[2]==='--worker'){
    const tts=createTts();process.stdout.write(JSON.stringify({ready:true,pid:process.pid})+'\n');
    const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
    for await(const line of lines){if(!line.trim())continue;let request;try{request=JSON.parse(line);process.stdout.write(JSON.stringify(await generate(tts,request))+'\n');}catch(e){process.stdout.write(JSON.stringify({ok:false,id:request?.id,error:String(e?.message||e).slice(0,500)})+'\n');}}
    return;
  }
  const requestFile=path.resolve(process.argv[2]||'');if(!inside(requestFile,requestDir))throw Error('Invalid request path');
  process.stdout.write(JSON.stringify(await generate(createTts(),JSON.parse(fs.readFileSync(requestFile,'utf8')))));
}
main().catch(e=>{process.stderr.write(String(e?.stack||e).slice(0,2000));process.exitCode=1;});
