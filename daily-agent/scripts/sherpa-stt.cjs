const path=require('path');
const readline=require('readline');
const sherpa=require('sherpa-onnx-node');
const OpenCC=require('opencc-js');
const traditional=OpenCC.Converter({from:'cn',to:'tw'});

const root=path.resolve(__dirname,'../..');
const model=path.join(root,'.daily-runtime','stt','sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30');
const hotwords=path.join(model,'daily-agent-hotwords.txt');
function recognizer(){
  return new sherpa.OnlineRecognizer({
    featConfig:{sampleRate:16000,featureDim:80},
    modelConfig:{
      transducer:{
        encoder:path.join(model,'encoder.int8.onnx'),
        decoder:path.join(model,'decoder.onnx'),
        joiner:path.join(model,'joiner.int8.onnx')
      },
      tokens:path.join(model,'tokens.txt'),numThreads:3,provider:'cpu',debug:false,modelingUnit:'cjkchar'
    },
    decodingMethod:'modified_beam_search',maxActivePaths:4,hotwordsFile:hotwords,hotwordsScore:1.8,enableEndpoint:true,
    rule1MinTrailingSilence:2.4,rule2MinTrailingSilence:.75,rule3MinUtteranceLength:20
  });
}
function pcm(buffer){
  const samples=new Float32Array(Math.floor(buffer.length/2));
  for(let i=0;i<samples.length;i++)samples[i]=buffer.readInt16LE(i*2)/32768;
  return samples;
}
function decode(rec,stream){while(rec.isReady(stream))rec.decode(stream);return rec.getResult(stream);}
function clean(text){return traditional(String(text||'').replace(/\s+/g,'').trim());}

async function worker(){
  const rec=recognizer();let stream=rec.createStream(),last='';
  process.stdout.write(JSON.stringify({ready:true,pid:process.pid,engine:'sherpa-onnx-zipformer-zh-int8-2025',provider:'cpu'})+'\n');
  const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  for await(const line of lines){
    if(!line.trim())continue;
    try{
      const request=JSON.parse(line);
      if(request.stop)break;
      const bytes=Buffer.from(String(request.audio||''),'base64');
      if(bytes.length){stream.acceptWaveform({samples:pcm(bytes),sampleRate:16000});const result=decode(rec,stream);last=clean(result.text)||last;}
      if(rec.isEndpoint(stream)){
        const result=decode(rec,stream),text=clean(result.text)||last;
        if(text)process.stdout.write(JSON.stringify({final:true,text})+'\n');
        rec.reset(stream);last='';
      }
    }catch(e){process.stdout.write(JSON.stringify({error:String(e?.message||e).slice(0,500)})+'\n');}
  }
}
async function fileTest(file){
  const rec=recognizer(),stream=rec.createStream(),wave=sherpa.readWave(path.resolve(file));
  stream.acceptWaveform({samples:wave.samples,sampleRate:wave.sampleRate});stream.inputFinished();
  const result=decode(rec,stream);process.stdout.write(JSON.stringify({text:clean(result.text),sampleRate:wave.sampleRate})+'\n');
}
(process.argv[2]==='--file'?fileTest(process.argv[3]):worker()).catch(e=>{process.stderr.write(String(e?.stack||e));process.exitCode=1;});
