import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ComfyUIImageRuntime,normalizeGenerationSpec} from '../models/ImageGeneration.js';

const execFileAsync=promisify(execFile);
const project=path.resolve(import.meta.dirname,'../..');
const root=path.join(project,'.daily-runtime','ComfyUI_windows_portable');
const outputDir=path.join(project,'daily-agent','test-output','photo-generation');
const checkpoint=path.join(root,'ComfyUI','models','checkpoints','PornMaster-Pro-SDXL-V7-VAE.safetensors');
const runtime=new ComfyUIImageRuntime({root,checkpoint,photoCheckpoint:checkpoint,outputDir,port:8191});
runtime.setProfile('photo');
const gpu=async()=>{
  try{return Number((await execFileAsync('nvidia-smi.exe',['--query-gpu=memory.used','--format=csv,noheader,nounits'])).stdout.trim().split(/\s+/)[0]);}
  catch{return null;}
};
const report={started_at:new Date().toISOString(),before_vram_mib:await gpu()};
let peak=report.before_vram_mib||0,timer;
try{
  await runtime.load();
  timer=setInterval(async()=>{peak=Math.max(peak,(await gpu())||0);},500);
  const result=await runtime.generate(normalizeGenerationSpec({
    prompt:'photorealistic, professional portrait of a fictional 28-year-old Taiwanese woman, natural skin texture, dark hair, warm window light, 85mm lens, shallow depth of field, tasteful casual clothing, detailed eyes',
    negative_prompt:'cartoon, anime, illustration, 3d render, low quality, blurry, bad anatomy, deformed hands, watermark, text',
    width:768,height:1024,steps:32,cfg:5.5,seed:20260928,
  }));
  report.file=result.file;report.bytes=result.bytes.length;report.profile=result.spec.profile;report.dimensions=`${result.spec.width}x${result.spec.height}`;
}finally{
  clearInterval(timer);
  report.peak_vram_mib=peak;
  try{await runtime.unload();}catch(error){report.unload_error=error.message;}
  await new Promise(resolve=>setTimeout(resolve,1500));
  report.after_vram_mib=await gpu();report.finished_at=new Date().toISOString();
  fs.mkdirSync(path.dirname(outputDir),{recursive:true});
  fs.writeFileSync(path.join(project,'daily-agent','test-output','photo-generation-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
