const fs=require('fs');const path=require('path');const {spawn}=require('child_process');
const root=path.resolve(__dirname,'../..'),wav=fs.readFileSync(path.join(root,'daily-agent','test-output','voice','voice-roundtrip.wav'));
let data=Buffer.concat([wav.subarray(44),Buffer.alloc(32000)]),offset=0,done=false,timer;
const child=spawn('node',[path.join(__dirname,'sherpa-stt.cjs'),'--worker'],{cwd:root,stdio:['pipe','pipe','inherit']});
child.stdout.setEncoding('utf8');let pending='';
child.stdout.on('data',chunk=>{pending+=chunk;let n;while((n=pending.indexOf('\n'))>=0){const line=pending.slice(0,n);pending=pending.slice(n+1);if(!line)continue;const message=JSON.parse(line);if(message.ready)feed();if(message.final){done=true;if(timer)clearInterval(timer);console.log(JSON.stringify(message));child.stdin.end('{"stop":true}\n');}}});
function feed(){timer=setInterval(()=>{if(offset>=data.length){clearInterval(timer);setTimeout(()=>{if(!done){console.error('No final streaming recognition result');child.kill();process.exitCode=1;}},2000);return;}const chunk=data.subarray(offset,Math.min(offset+3200,data.length));offset+=chunk.length;child.stdin.write(JSON.stringify({audio:chunk.toString('base64')})+'\n');},15);}
