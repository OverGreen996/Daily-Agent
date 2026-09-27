import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {ComfyUIImageRuntime} from '../models/ImageGeneration.js';

const exec=promisify(execFile),here=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(here,'../..');
async function gpu(){const {stdout}=await exec('nvidia-smi.exe',['--query-gpu=memory.used','--format=csv,noheader,nounits']);return Number(stdout.trim().split(/\s+/)[0]);}
const root=path.join(project,'.daily-runtime','ComfyUI_windows_portable');
const checkpoint=path.join(root,'ComfyUI','models','checkpoints','NoobAI-XL-v1.1.safetensors');
const runtime=new ComfyUIImageRuntime({root,checkpoint,outputDir:path.join(project,'daily-agent','test-output','generated-images'),port:8189});
const report={started_at:new Date().toISOString(),before_vram_mib:await gpu()};
try{
  await runtime.load();report.loaded_vram_mib=await gpu();
  const made=await runtime.generate({prompt:'masterpiece, best quality, newest, absurdres, highres, 1girl, adult, cute silver hair fantasy desktop mascot, warm smile, sitting beside a glowing memory palace, detailed anime illustration, soft teal light',negative_prompt:'worst quality, old, early, low quality, lowres, bad anatomy, bad hands, extra fingers, signature, username, logo, watermark, text',width:1024,height:1024,steps:25,cfg:5.5,seed:20260928});
  report.file=made.file;report.bytes=made.bytes.length;report.spec=made.spec;report.generated_vram_mib=await gpu();
  report.passed=made.bytes.length>10000;
}catch(error){report.passed=false;report.error=error.stack||error.message;}
finally{try{await runtime.unload();}catch(error){report.unload_error=error.message;}report.after_vram_mib=await gpu();report.finished_at=new Date().toISOString();fs.mkdirSync(path.join(project,'daily-agent','test-output'),{recursive:true});fs.writeFileSync(path.join(project,'daily-agent','test-output','image-generation-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
if(!report.passed||report.unload_error)process.exitCode=1;
