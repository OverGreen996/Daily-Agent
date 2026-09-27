import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImageGenerationRequest,parseImageModeCommand,isImageGenerationFollowup,parseAttachedImageEdit,imageEditDenoise,imageDimensions,fitImageDimensions,enforceRequestedImageConcepts,assertImagePolicy,normalizeGenerationSpec,mergeContinuationSpec,ComfyUIImageRuntime} from '../models/ImageGeneration.js';

test('conversation image intent is explicit and does not capture image questions',()=>{
  assert.equal(parseImageModeCommand('生圖模式'),'enter');
  assert.equal(parseImageModeCommand('開啟生圖模式'),'enter');
  assert.equal(parseImageModeCommand('高畫質生圖模式'),'enter_quality');
  assert.equal(parseImageModeCommand('快速生圖模式'),'enter_fast');
  assert.equal(parseImageModeCommand('真人模式'),'enter_photo');
  assert.equal(parseImageModeCommand('進入真人寫真模式'),'enter_photo');
  assert.equal(parseImageModeCommand('動漫模式'),'enter_quality');
  assert.equal(parseImageModeCommand('切換動漫模式'),'enter_quality');
  assert.equal(parseImageModeCommand('結束這張圖'),'new');
  assert.equal(parseImageModeCommand('開始新圖'),'new');
  assert.equal(parseImageModeCommand('清除生圖上下文'),'new');
  assert.equal(parseImageModeCommand('結束生圖'),'exit');
  assert.equal(parseImageModeCommand('退出生圖模式'),'exit');
  assert.equal(parseImageModeCommand('生圖模式是什麼'),null);
  assert.equal(parseImageGenerationRequest('幫我畫一張月下的成年女劍士').request,'月下的成年女劍士');
  assert.equal(parseImageGenerationRequest('生成圖片：雨夜台北街頭').request,'雨夜台北街頭');
  assert.equal(parseImageGenerationRequest('幫我看看這張圖片'),null);
  assert.equal(parseImageGenerationRequest('我們來討論生圖模型'),null);
  assert.equal(parseImageGenerationRequest('做一個表格整理資料'),null);
  assert.equal(parseImageGenerationRequest('我要成年銀髮精靈的插畫').request,'成年銀髮精靈');
  assert.equal(parseImageGenerationRequest('新圖片：森林裡的精靈').request,'森林裡的精靈');
  assert.equal(parseImageGenerationRequest('另外畫一張新的海邊插畫').request,'海邊插畫');
  assert.equal(isImageGenerationFollowup('改成全裸'),true);
  assert.equal(isImageGenerationFollowup('讓她脫掉衣服'),true);
  assert.equal(isImageGenerationFollowup('w腿蹲下 露出性器官'),true);
  assert.equal(isImageGenerationFollowup('w腿  全裸'),true);
  assert.equal(isImageGenerationFollowup('延續上一張 正面 亞洲蹲'),true);
  assert.equal(isImageGenerationFollowup('幫我修改一下上一張的鏡頭'),true);
  assert.equal(isImageGenerationFollowup('使用雙手掰開性器官 展示結構'),true);
  assert.equal(isImageGenerationFollowup('可以掰開性器官嗎'),true);
  assert.equal(isImageGenerationFollowup('有什麼模型可以裸露嗎'),false);
});

test('first image-mode description may contain edit-like pose or adult words',()=>{
  const route=(imageMode,lastImageSpec,text)=>{
    const followup=isImageGenerationFollowup(text);
    if(followup&&lastImageSpec)return {request:text,previousSpec:lastImageSpec};
    if(imageMode)return {request:text};
    return null;
  };
  assert.deepEqual(route(true,null,'一名成年女性裸體站在窗邊'),{request:'一名成年女性裸體站在窗邊'});
  assert.deepEqual(route(true,null,'把背景換成攝影棚'),{request:'把背景換成攝影棚'});
  assert.equal(route(false,null,'把背景換成攝影棚'),null);
});

test('attached image editing is explicit and has conversational strength',()=>{
  assert.equal(parseAttachedImageEdit('這張圖是什麼'),null);
  assert.equal(parseAttachedImageEdit('幫我把背景換成夜景').denoise,0.44);
  assert.equal(parseAttachedImageEdit('把我上傳的圖跟上一張生成圖融合').denoise,0.44);
  assert.equal(parseAttachedImageEdit('保持人物，只改衣服').denoise,0.28);
  assert.equal(parseAttachedImageEdit('全部重新畫成油畫').denoise,0.68);
  const png=Buffer.alloc(24);png.writeUInt8(0x89,0);png.write('PNG',1);png.writeUInt32BE(1600,16);png.writeUInt32BE(900,20);
  assert.deepEqual(imageDimensions(png),{width:1600,height:900});
  const fitted=fitImageDimensions({width:1600,height:900});
  assert.ok(Math.abs(fitted.width/fitted.height-16/9)<0.12);
});

test('generation spec is bounded for 12GB GPU',()=>{
  const s=normalizeGenerationSpec({prompt:'x',width:99999,height:100,steps:900,cfg:99,seed:42});
  assert.deepEqual({width:s.width,height:s.height,steps:s.steps,cfg:s.cfg,seed:s.seed},{width:1536,height:512,steps:40,cfg:12,seed:42});
});

test('continuation preserves the prior character and adult scale for short pose edits',()=>{
  const spec=mergeContinuationSpec(
    {prompt:'masterpiece, 1girl, silver hair elf, nude, explicit, showing genitalia, seductive pose',negative_prompt:'bad anatomy'},
    {prompt:'masterpiece, 1boy, asian, crouching, front view, intricate clothing details',negative_prompt:'low quality'},
    '延續上一張 正面 亞洲蹲',
  );
  assert.match(spec.prompt,/1girl/i);
  assert.match(spec.prompt,/silver hair elf/i);
  assert.match(spec.prompt,/nude/i);
  assert.match(spec.prompt,/crouching/i);
  assert.doesNotMatch(spec.prompt,/1boy|clothing details|seductive pose/i);
});

test('continuation can add a partner without retaining solo or deleting male tags',()=>{
  const spec=mergeContinuationSpec(
    {prompt:'masterpiece, 1girl, female elf, solo, holding crystal ball, starry background',negative_prompt:'bad anatomy'},
    {prompt:'1girl, 1boy, orc male, sexual intercourse, climax',negative_prompt:'low quality'},
    '讓女精靈跟獸人性交並高潮',
  );
  assert.match(spec.prompt,/orc male/i);
  assert.match(spec.prompt,/1boy/i);
  assert.doesNotMatch(spec.prompt,/(?:^|, )solo(?:,|$)/i);
});

test('explicit fictional request restores concrete concepts omitted by the planner',()=>{
  const spec=enforceRequestedImageConcepts({
    prompt:'masterpiece, 1girl, elf, solo, wearing fantasy armor, dynamic pose',
    negative_prompt:'bad anatomy',
  },'女精靈跟獸人性交、高潮噴尿');
  for(const term of ['adult female elf','adult male orc','2people','sexual intercourse','penetration','orgasm','female urination'])assert.match(spec.prompt,new RegExp(term,'i'));
  assert.doesNotMatch(spec.prompt,/(?:^|, )(?:solo|wearing fantasy armor)(?:,|$)/i);
});

test('requested adult nudity cannot be cancelled by the planner negative prompt',()=>{
  const spec=enforceRequestedImageConcepts({
    prompt:'a beautiful young woman, nude, lying on a beach towel, photorealistic',
    negative_prompt:'cartoon, low quality, nsfw, nude, explicit, mature content',
  },'裸體美少女');
  assert.match(spec.prompt,/fully nude/i);
  assert.match(spec.prompt,/bare breasts/i);
  assert.match(spec.prompt,/25-year-old adult woman/i);
  assert.doesNotMatch(spec.negative_prompt,/nsfw|nude|explicit|mature content/i);
  assert.match(spec.negative_prompt,/cartoon|low quality/i);
  assert.match(spec.negative_prompt,/clothes|dress|underwear/i);
});

test('adult nudity removes planner-invented clothing and conflicting ages',()=>{
  const spec=enforceRequestedImageConcepts({
    prompt:'A beautiful young woman, 20 years old, wearing only a sheer white silk robe, golden hour portrait',
    negative_prompt:'cartoon, low quality',
  },'裸體美少女');
  assert.doesNotMatch(spec.prompt,/20 years old|wearing|robe/i);
  assert.match(spec.prompt,/25-year-old adult woman/i);
});

test('explicit lower-body request survives planning and forces lower body into frame',()=>{
  const spec=enforceRequestedImageConcepts({
    prompt:'A beautiful young woman, portrait shot, 85mm lens, standing confidently',
    negative_prompt:'low quality, cropped',width:1024,height:1024,
  },'裸體並展示下體的美少女');
  assert.match(spec.prompt,/visible vulva|exposed genitals/i);
  assert.match(spec.prompt,/lower body visible|full body/i);
  assert.doesNotMatch(spec.prompt,/portrait shot|85mm lens/i);
  assert.match(spec.negative_prompt,/genitals out of frame|cropped lower body/i);
  assert.ok(spec.height>spec.width);
  assert.match(spec.prompt,/25-year-old adult woman/i);
});

test('partial exposure preserves requested sailor uniform instead of forcing full nudity',()=>{
  const spec=enforceRequestedImageConcepts({
    prompt:'Japanese beautiful girl, sailor suit, lifting skirt, low angle, mature adult female',
    negative_prompt:'anime, low quality',width:1024,height:1024,
  },'日本美少女 水手服 沒穿內褲 掀起裙子 露出下體');
  assert.match(spec.prompt,/wearing sailor uniform/i);
  assert.match(spec.prompt,/lifting skirt with hands/i);
  assert.match(spec.prompt,/no panties/i);
  assert.match(spec.prompt,/visible vulva/i);
  assert.match(spec.prompt,/Japanese adult woman/i);
  assert.match(spec.prompt,/entire head and face visible/i);
  assert.doesNotMatch(spec.prompt,/fully nude|bare breasts|low angle/i);
  assert.match(spec.negative_prompt,/fully nude|topless/i);
  assert.match(spec.negative_prompt,/cropped head|face out of frame/i);
  assert.doesNotMatch(spec.negative_prompt,/clothes|uniform|skirt/i);
});

test('adult content is not broadly filtered while prohibited sexual content is rejected',()=>{
  assert.doesNotThrow(()=>assertImagePolicy('一名 25 歲成年女性的人體藝術裸照，虛構角色'));
  assert.throws(()=>assertImagePolicy('未成年幼女裸體色情圖'),/未成年/);
  assert.throws(()=>assertImagePolicy('強姦場景'),/非自願/);
  assert.throws(()=>assertImagePolicy('替真人做色情裸照'),/真實人物/);
});

test('Comfy workflow uses configured checkpoint and one image',()=>{
  const r=new ComfyUIImageRuntime({root:'C:/runtime',checkpoint:'C:/runtime/ComfyUI/models/checkpoints/model.safetensors',outputDir:'C:/out'});
  const w=r.workflow(normalizeGenerationSpec({prompt:'fox',seed:7}));
  assert.equal(w['1'].inputs.ckpt_name,'model.safetensors');
  assert.equal(w['4'].inputs.batch_size,1);
  assert.equal(w['5'].inputs.model[0],'1');
  assert.equal(w['7'].class_type,'SaveImage');
});

test('quality profile applies v-prediction and learned anime super-resolution',()=>{
  const r=new ComfyUIImageRuntime({root:'C:/runtime',checkpoint:'C:/runtime/ComfyUI/models/checkpoints/fast.safetensors',qualityCheckpoint:'C:/runtime/ComfyUI/models/checkpoints/vpred.safetensors',outputDir:'C:/out'});
  r.setProfile('quality');
  const w=r.workflow(normalizeGenerationSpec({prompt:'1girl',width:1024,height:1024,seed:7,cfg:5}));
  assert.equal(w['1'].inputs.ckpt_name,'vpred.safetensors');
  assert.deepEqual(w['8'].inputs,{model:['1',0],sampling:'v_prediction',zsnr:true});
  assert.equal(w['6'].class_type,'VAEDecodeTiled');
  assert.equal(w['6'].inputs.samples[0],'5');
  assert.equal(w['9'].class_type,'UpscaleModelLoader');
  assert.equal(w['9'].inputs.model_name,'RealESRGAN_x4plus_anime_6B.pth');
  assert.equal(w['10'].class_type,'ImageUpscaleWithModel');
  assert.equal(w['11'].class_type,'ImageScale');
  assert.equal(w['11'].inputs.width,1536);
  assert.equal(w['11'].inputs.height,1536);
  assert.equal(w['11'].inputs.upscale_method,'lanczos');
  assert.deepEqual(w['7'].inputs.images,['11',0]);
  assert.equal(w['2'].inputs.text,'1girl');
});

test('quality image edit encodes the uploaded image and preserves it with bounded denoise',()=>{
  const r=new ComfyUIImageRuntime({root:'C:/runtime',checkpoint:'C:/runtime/fast.safetensors',qualityCheckpoint:'C:/runtime/vpred.safetensors',outputDir:'C:/out'});
  r.setProfile('quality');
  const w=r.editWorkflow(normalizeGenerationSpec({prompt:'same character, night background',width:896,height:1152,seed:9,cfg:5}),'source.png',0.28);
  assert.equal(w['12'].class_type,'LoadImage');
  assert.equal(w['12'].inputs.image,'source.png');
  assert.equal(w['4'].class_type,'VAEEncode');
  assert.equal(w['5'].inputs.latent_image[0],'4');
  assert.equal(w['5'].inputs.denoise,0.28);
  assert.equal(w['5'].inputs.model[0],'8');
  assert.equal(w['7'].inputs.images[0],'11');
});

test('photo profile uses Realism Pony checkpoint and recommended SDXL sampling',()=>{
  const r=new ComfyUIImageRuntime({root:'C:/runtime',checkpoint:'C:/runtime/fast.safetensors',qualityCheckpoint:'C:/runtime/vpred.safetensors',photoCheckpoint:'C:/runtime/realismPonyV3.safetensors',outputDir:'C:/out'});
  r.setProfile('photo');
  const w=r.workflow(normalizeGenerationSpec({prompt:'a portrait photo of an adult woman',seed:12,steps:35,cfg:5.5}));
  assert.equal(w['1'].inputs.ckpt_name,'realismPonyV3.safetensors');
  assert.equal(w['5'].inputs.sampler_name,'dpmpp_2m');
  assert.equal(w['5'].inputs.scheduler,'karras');
  assert.equal(w['6'].class_type,'VAEDecodeTiled');
  assert.equal(w['7'].inputs.filename_prefix,'DailyAgent-Photo');
  assert.equal(w['9'],undefined);
});

test('PornMaster photo profile uses its recommended Euler a and SGM Uniform sampling',()=>{
  const r=new ComfyUIImageRuntime({root:'C:/runtime',checkpoint:'C:/runtime/fast.safetensors',photoCheckpoint:'C:/runtime/PornMaster-Pro-SDXL-V7-VAE.safetensors',outputDir:'C:/out'});
  r.setProfile('photo');
  const w=r.workflow(normalizeGenerationSpec({prompt:'photorealistic adult portrait',seed:15,steps:28,cfg:6}));
  assert.equal(w['1'].inputs.ckpt_name,'PornMaster-Pro-SDXL-V7-VAE.safetensors');
  assert.equal(w['5'].inputs.sampler_name,'euler_ancestral');
  assert.equal(w['5'].inputs.scheduler,'sgm_uniform');
  assert.equal(w['5'].inputs.cfg,6);
});
