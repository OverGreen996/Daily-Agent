import fs from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function parseImageGenerationRequest(text) {
  const value = String(text || "").trim();
  const match = value.match(/^(?:露米[，, ]*)?(?:請|可以)?(?:(?:幫我|替我)?|(?:另外|重新|新))(?:(?:生成|生出|畫|繪製)(?:一張|一幅|個)?(?:新的?)?(?:圖片|圖像|圖|插畫|桌布|頭像)?|做(?:一張|一幅|個)?(?:新的?)?(?:圖片|圖像|圖|插畫|桌布|頭像))[：:，, ]*(.{2,})$/iu)
    || value.match(/^(?:露米[，, ]*)?(?:新圖片|新圖|新的圖片)[：:，, ]+(.{2,})$/iu);
  if (!match) {
    const request=value.match(/^(?:露米[，, ]*)?(?:我想要|我要|給我|來)(?:一張|一幅|個)?[：:，, ]*(.{2,}?)(?:的)?(?:圖片|圖像|插畫|桌布|頭像)$/iu);
    return request?{request:request[1].trim()}:null;
  }
  if (/^(?:看看|看|解釋|描述|分析|摘要)/u.test(match[1])) return null;
  return { request: match[1].trim() };
}

export function parseImageModeCommand(text) {
  const value=String(text||'').replace(/[，,。！!？?\s]/gu,'');
  if(/^(?:開啟|進入|開始|切換)?(?:真人|寫真|真人寫真)(?:生圖)?模式$/u.test(value))return 'enter_photo';
  if(/^(?:開啟|進入|開始|切換)?動漫(?:生圖)?模式$/u.test(value))return 'enter_quality';
  if(/^(?:開啟|進入|開始|切換)?高畫質生圖模式$/u.test(value))return 'enter_quality';
  if(/^(?:開啟|進入|開始|切換)?快速生圖模式$/u.test(value))return 'enter_fast';
  if(/^(?:開啟|進入|開始|切換)?生圖模式$/u.test(value))return 'enter';
  if(/^(?:結束這張圖|結束上一張|開始新圖|開新圖|新圖片|新圖|清除生圖上下文|清除圖片上下文)$/u.test(value))return 'new';
  if(/^(?:結束生圖|退出生圖模式|關閉生圖模式|回到聊天模式)$/u.test(value))return 'exit';
  return null;
}

export function isImageGenerationFollowup(text) {
  const value=String(text||'').trim();
  if(!value||/為什麼|怎麼|什麼|哪個|哪些|模型/u.test(value))return false;
  return /(?:延續上一張|接著上一張|以上一張|上一張|繼續改|繼續畫|修改|改圖|重畫|再畫|(?:再|請)?(?:把|改成|換成|變成|讓(?:她|他|它))|使用雙手|衣服|姿勢|背景|鏡頭|正面|背面|側面|胸部|下身|性器官|生殖器|展示結構|全裸|裸體|脫掉|拿掉|加上|移除|露出|掰開|撥開|蹲下|亞洲蹲|跪下|趴下|躺下|[wmＭＷｗｍ]腿)/iu.test(value);
}

export function parseAttachedImageEdit(text) {
  const value=String(text||'').trim();
  if(!value)return null;
  const edit=/(?:改圖|修改(?:這|此|我)?(?:張)?圖|重畫|重新畫|融合|合成|結合|混合|改成|換成|變成|換掉|移除|加上|(?:保留|保持).*(?:改|換)|把.+(?:改|換|變|移除|加上|融合|合成|結合)|讓(?:她|他|它).+(?:穿|戴|拿|變|改)|背景.+(?:改|換))/iu.test(value);
  return edit?{request:value,denoise:imageEditDenoise(value)}:null;
}

export function imageEditDenoise(text) {
  const value=String(text||'');
  if(/(?:完全|全部|大幅|重新|重畫|自由發揮|改很多)/u.test(value))return 0.68;
  if(/(?:稍微|微調|小改|只改|保持|保留|不要動|不變)/u.test(value))return 0.28;
  return 0.44;
}

export function imageDimensions(bytes) {
  if(!Buffer.isBuffer(bytes)||bytes.length<24)throw Error('圖片格式錯誤');
  if(bytes.subarray(1,4).toString()==='PNG')return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(bytes.subarray(0,4).toString('hex')==='52494646'&&bytes.subarray(8,12).toString()==='WEBP'){
    const kind=bytes.subarray(12,16).toString();
    if(kind==='VP8X')return {width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};
    if(kind==='VP8 '&&bytes.length>=30)return {width:bytes.readUInt16LE(26)&0x3fff,height:bytes.readUInt16LE(28)&0x3fff};
    if(kind==='VP8L'&&bytes.length>=25){const bits=bytes.readUInt32LE(21);return {width:(bits&0x3fff)+1,height:((bits>>14)&0x3fff)+1};}
  }
  if(bytes[0]===0xff&&bytes[1]===0xd8){
    let offset=2;
    while(offset+9<bytes.length){
      if(bytes[offset]!==0xff){offset++;continue;}
      const marker=bytes[offset+1];
      if(marker===0xd8||marker===0xd9){offset+=2;continue;}
      const length=bytes.readUInt16BE(offset+2);
      if(length<2||offset+2+length>bytes.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))
        return {height:bytes.readUInt16BE(offset+5),width:bytes.readUInt16BE(offset+7)};
      offset+=2+length;
    }
  }
  throw Error('無法讀取圖片尺寸');
}

export function fitImageDimensions({width,height}) {
  if(!(width>0&&height>0))throw Error('圖片尺寸錯誤');
  const scale=Math.sqrt((1024*1024)/(width*height));
  let w=Math.round(width*scale/64)*64,h=Math.round(height*scale/64)*64;
  w=Math.max(512,Math.min(1536,w));h=Math.max(512,Math.min(1536,h));
  return {width:w,height:h};
}

export function assertImagePolicy(text) {
  const compact = String(text || "").toLowerCase().replace(/\s+/g, "");
  const minor = /未成年|幼女|幼男|兒童|小學生|國中生|高中生|child|minor|underage|loli|shota/.test(compact);
  const sexual = /裸體|全裸|性交|做愛|性愛|色情|露點|性器|nude|naked|sex|porn|nsfw|genital/.test(compact);
  if (minor && sexual) throw Error("不能生成涉及未成年人的色情或裸露內容。可以改成明確成年角色，或改為非色情構圖。");
  if (/強姦|迷姦|性侵|rape|nonconsensual/.test(compact))
    throw Error("不能生成強迫或非自願的性內容。");
  if (/(真人|本人|真實人物|realperson).*(裸照|色情|性愛|nude|porn)|(?:裸照|色情|性愛|nude|porn).*(真人|本人|真實人物|realperson)/.test(compact))
    throw Error("不能替真實人物製作未經同意的露骨色情圖像。");
}

export function normalizeGenerationSpec(input = {}) {
  const dimension = (n, fallback) => Math.max(512, Math.min(1536, Math.round((Number(n) || fallback) / 64) * 64));
  return {
    prompt: String(input.prompt || "").trim().slice(0, 4000),
    negative_prompt: String(input.negative_prompt || "low quality, blurry, bad anatomy, extra fingers, watermark, text").trim().slice(0, 2000),
    width: dimension(input.width, 1024),
    height: dimension(input.height, 1024),
    steps: Math.max(12, Math.min(40, Math.round(Number(input.steps) || 28))),
    cfg: Math.max(1, Math.min(12, Number(input.cfg) || 6)),
    seed: Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed : Math.floor(Math.random() * 2_147_483_647),
    sampler_name: "euler_ancestral",
    scheduler: "normal",
  };
}

const splitTags=(value)=>String(value||'').split(',').map(tag=>tag.trim()).filter(Boolean);
const uniqueTags=(tags)=>[...new Map(tags.map(tag=>[tag.toLowerCase(),tag])).values()];

// The conversational planner can silently omit concrete concepts from an
// adult fictional request.  Keep it useful for composition and style, then
// deterministically restore explicit concepts that the user actually wrote.
export function enforceRequestedImageConcepts(input={},request='') {
  const spec=normalizeGenerationSpec(input),value=String(request||'').toLowerCase();
  let tags=splitTags(spec.prompt);
  let negativeTags=splitTags(spec.negative_prompt);
  const add=[];
  const femaleElf=/女精靈|female\s*elf/u.test(value);
  const orc=/獸人|orc/u.test(value);
  const intercourse=/性交|做愛|交媾|sex(?:ual)?\s*intercourse|penetration/u.test(value);
  const orgasm=/高潮|orgasm|climax/u.test(value);
  const urination=/噴尿|排尿|撒尿|尿液|urination|peeing/u.test(value);
  const genitalDisplay=/展示下體|露出下體|裸露下體|下體露出|私處|陰部|外陰|性器官|生殖器|visible\s+(?:vulva|genitals?)|exposed\s+(?:vulva|genitals?)/u.test(value);
  const fullNudity=/裸體|全裸|裸身|一絲不掛|fully\s*nude|\bnude\b|\bnaked\b/u.test(value);
  const sailorUniform=/水手服|sailor\s*(?:suit|uniform)/u.test(value);
  const noUnderwear=/沒穿內褲|沒有內褲|無內褲|不穿內褲|no\s*(?:panties|underwear)/u.test(value);
  const liftedSkirt=/掀起裙子|撩起裙子|拉起裙子|lifting\s*(?:her\s*)?skirt/u.test(value);
  const japanese=/日本|japanese/u.test(value);
  const female=/女性|女人|女生|女孩|少女|美女|美少女|woman|female|girl/u.test(value);
  const male=/男性|男人|男生|美男|man|male|boy/u.test(value);
  if(femaleElf)add.push('1girl','adult female elf');
  if(orc)add.push('1boy','adult male orc','muscular male','green skin');
  if(femaleElf&&orc)add.push('2people','hetero','couple');
  if(intercourse){
    tags=tags.filter(tag=>!/(?:^|\W)(?:solo|wearing .*armor|armor|fully clothed)(?:$|\W)/i.test(tag));
    add.push('nsfw','nude','explicit','sexual intercourse','penetration');
  }
  if(orgasm)add.push('orgasm','climax');
  if(urination)add.push('female urination','urination','female ejaculation');
  if(fullNudity){
    tags=tags.filter(tag=>!/(?:\b\d{1,2}\s*(?:years? old|year-old)\b|fully clothed|\bwearing\b|clothes|clothing|dress|robe|lingerie|underwear|swimsuit|towel wrapped|modest clothing|covered body)/i.test(tag));
    add.push('adult','(fully nude:1.5)','(bare breasts:1.35)','(visible nipples:1.25)','no clothing','uncovered body');
    if(female)add.push('25-year-old adult woman');
    else if(male)add.push('25-year-old adult man');
    negativeTags=negativeTags.filter(tag=>!/(?:nsfw|nude|naked|nudity|explicit|mature content|nipples|genitals?|sexual content)/i.test(tag));
    negativeTags.push('clothes','clothing','dress','bra','underwear','lingerie','swimsuit','robe','body covering');
  }
  let width=spec.width,height=spec.height;
  if(genitalDisplay){
    tags=tags.filter(tag=>!/(?:close[ -]?up|headshot|upper body|waist[ -]?up|portrait shot|85mm lens|low angle)/i.test(tag));
    tags=tags.filter(tag=>!/(?:\b\d{1,2}\s*(?:years? old|year-old)\b)/i.test(tag));
    negativeTags=negativeTags.filter(tag=>!/(?:nsfw|explicit|mature content|vulva|genitals?|sexual content)/i.test(tag));
    add.push('adult');
    if(female)add.push('25-year-old adult woman');
    else if(male)add.push('25-year-old adult man');
    if(japanese&&female)add.push('(Japanese adult woman:1.25)','beautiful Japanese woman');
    if(!fullNudity){
      add.push('lower body exposed');
      if(sailorUniform)add.push('(wearing sailor uniform:1.3)','sailor collar','pleated skirt');
      if(noUnderwear){add.push('(no panties:1.4)','no underwear');negativeTags.push('panties','underwear');}
      if(liftedSkirt)add.push('(lifting skirt with hands:1.4)','skirt raised above hips');
      if(sailorUniform||liftedSkirt)negativeTags=negativeTags.filter(tag=>!/(?:clothes|clothing|dress|skirt|uniform|sailor)/i.test(tag));
      negativeTags.push('fully nude','topless','bare breasts');
    }
    add.push('(visible vulva:1.45)','(exposed genitals:1.4)','front view','full body','wide shot','camera pulled back','(entire head and face visible:1.35)','head-to-knees in frame','lower body visible','legs slightly apart','35mm lens');
    negativeTags.push('cropped lower body','cropped head','face out of frame','genitals out of frame','covered genitals','crossed legs','close-up','upper body only');
    if(width>=height){width=832;height=1216;}
  }
  return normalizeGenerationSpec({...spec,width,height,prompt:uniqueTags([...tags,...add]).join(', '),negative_prompt:uniqueTags(negativeTags).join(', ')});
}

// A continuation is a new render that keeps the last image specification.  The
// small prompt planner can occasionally replace the character when it sees a
// short edit such as "亞洲蹲", so continuity is enforced here as data rather
// than relying on the model to remember every tag.
export function mergeContinuationSpec(previous = {}, planned = {}, instruction = '') {
  const base=normalizeGenerationSpec(previous);
  const next=normalizeGenerationSpec({...base,...planned});
  const request=String(instruction||'').toLowerCase();
  let baseTags=splitTags(base.prompt);
  let addedTags=splitTags(next.prompt);
  const baseText=base.prompt.toLowerCase();
  const changesGender=/(?:改成|變成|換成|要)(?:男|女)|男性|女性|男生|女生|1boy|1girl/u.test(request);
  const addsPartner=/(?:跟|與|和).*(?:獸人|男人|男性|男生|男性角色|orc|man|male)|(?:加入|增加|新增).*(?:角色|人物|獸人|男人|男性|orc|man|male)|多人|兩人|性交|做愛/u.test(request);
  if(addsPartner)baseTags=baseTags.filter(tag=>!/(?:^|\W)solo(?:$|\W)/i.test(tag));
  if(!changesGender&&!addsPartner){
    if(/1girl|female|woman|girl/.test(baseText))addedTags=addedTags.filter(tag=>!/(?:^|\W)(?:1boy|male|man|boy)(?:$|\W)/i.test(tag));
    if(/1boy|male|man|boy/.test(baseText))addedTags=addedTags.filter(tag=>!/(?:^|\W)(?:1girl|female|woman|girl)(?:$|\W)/i.test(tag));
  }
  const requestsClothes=/穿上|穿著|換裝|服裝|衣服/u.test(request)&&!/脫掉|拿掉|全裸|裸體|不穿/u.test(request);
  if(/nude|naked|nsfw|explicit|bare chest|genital/.test(baseText)&&!requestsClothes)
    addedTags=addedTags.filter(tag=>!/clothing|clothes|dress|shirt|pants|skirt|underwear/i.test(tag));
  if(requestsClothes)
    baseTags=baseTags.filter(tag=>!/nude|naked|nsfw|explicit|bare chest|bare legs|genital|no underwear/i.test(tag));
  if(/正面|背面|側面|蹲|跪|趴|躺|站|坐/u.test(request))
    baseTags=baseTags.filter(tag=>!/dynamic pose|seductive pose|standing|sitting|kneeling|crouching|lying|front view|back view|side view/i.test(tag));
  return enforceRequestedImageConcepts({
    ...base,
    ...planned,
    prompt:uniqueTags([...baseTags,...addedTags]).join(', '),
    negative_prompt:uniqueTags([...splitTags(base.negative_prompt),...splitTags(next.negative_prompt)]).join(', '),
    seed:Number.isSafeInteger(planned.seed)&&planned.seed>=0?planned.seed:undefined,
  },instruction);
}

export class ComfyUIImageRuntime {
  constructor({ root, checkpoint, qualityCheckpoint, photoCheckpoint, outputDir, port = 8189, fetcher = fetch }) {
    Object.assign(this, { root, checkpoint, qualityCheckpoint, photoCheckpoint, outputDir, port, fetcher });
    this.defaultCheckpoint=checkpoint;
    this.profile='fast';
    this.process = null;
    this.base = `http://127.0.0.1:${port}`;
  }
  setProfile(profile='fast') {
    this.profile=['quality','photo'].includes(profile)?profile:'fast';
    this.checkpoint=this.profile==='quality'
      ?(this.qualityCheckpoint||this.defaultCheckpoint)
      :this.profile==='photo'?(this.photoCheckpoint||this.defaultCheckpoint):this.defaultCheckpoint;
  }
  python() { return path.join(this.root, "python_embeded", "python.exe"); }
  main() { return path.join(this.root, "ComfyUI", "main.py"); }
  async request(route, options = {}, timeout = 15000) {
    const response = await this.fetcher(this.base + route, { ...options, signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw Error(`ComfyUI ${route}: HTTP ${response.status}`);
    return response;
  }
  async status() {
    try {
      const response = await this.request("/system_stats", {}, 1200);
      const data = await response.json();
      const gpu = data.devices?.find((d) => /cuda/i.test(d.type || d.name || ""));
      return { name: "ComfyUI", size_vram: gpu ? Math.max(0, (gpu.vram_total - gpu.vram_free) || 1) : 1 };
    } catch { return null; }
  }
  async load() {
    const resident = await this.status();
    if (resident) return resident;
    if (!fs.existsSync(this.python()) || !fs.existsSync(this.main()))
      throw Error("本地生圖後端尚未安裝。請開啟桌面 Daily Agent Setup，勾選對應的生圖功能下載。");
    if (!fs.existsSync(this.checkpoint))
      throw Error("本地生圖模型尚未下載。請開啟桌面 Daily Agent Setup，勾選對應的生圖功能下載。");
    const logDir = path.dirname(this.outputDir);
    fs.mkdirSync(logDir, { recursive: true });
    const out = fs.openSync(path.join(logDir, "comfyui.out.log"), "a");
    const err = fs.openSync(path.join(logDir, "comfyui.err.log"), "a");
    const memoryArgs=this.profile==='quality'?["--reserve-vram","0.6"]:["--lowvram"];
    this.process = spawn(this.python(), ["-s", this.main(), "--windows-standalone-build", "--listen", "127.0.0.1", "--port", String(this.port), "--disable-auto-launch", ...memoryArgs], {
      cwd: this.root, windowsHide: true, stdio: ["ignore", out, err],
    });
    this.process.once("exit", () => { this.process = null; });
    const until = Date.now() + 120000;
    while (Date.now() < until) {
      const state = await this.status();
      if (state) return state;
      if (this.process?.exitCode != null) break;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    throw Error("ComfyUI 啟動失敗，請查看 .daily-runtime/comfyui.err.log。");
  }
  workflow(spec) {
    if(this.profile==='quality')return this.qualityWorkflow(spec);
    if(this.profile==='photo')return this.photoWorkflow(spec);
    return {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: path.basename(this.checkpoint) } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: spec.prompt, clip: ["1", 1] } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: spec.negative_prompt, clip: ["1", 1] } },
      "4": { class_type: "EmptyLatentImage", inputs: { width: spec.width, height: spec.height, batch_size: 1 } },
      "5": { class_type: "KSampler", inputs: { seed: spec.seed, steps: spec.steps, cfg: spec.cfg, sampler_name: spec.sampler_name, scheduler: spec.scheduler, denoise: 1, model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] } },
      "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
      "7": { class_type: "SaveImage", inputs: { filename_prefix: "DailyAgent", images: ["6", 0] } },
    };
  }
  editWorkflow(spec,sourceName,denoise=0.44) {
    const quality=this.profile==='quality';
    const photo=this.profile==='photo';
    const finalWidth=Math.min(1792,Math.round(spec.width*1.5/64)*64);
    const finalHeight=Math.min(1792,Math.round(spec.height*1.5/64)*64);
    const model=quality?["8",0]:["1",0];
    const workflow={
      "1":{class_type:"CheckpointLoaderSimple",inputs:{ckpt_name:path.basename(this.checkpoint)}},
      "2":{class_type:"CLIPTextEncode",inputs:{text:spec.prompt,clip:["1",1]}},
      "3":{class_type:"CLIPTextEncode",inputs:{text:spec.negative_prompt,clip:["1",1]}},
      "12":{class_type:"LoadImage",inputs:{image:sourceName}},
      "13":{class_type:"ImageScale",inputs:{image:["12",0],upscale_method:"lanczos",width:spec.width,height:spec.height,crop:"disabled"}},
      "4":{class_type:"VAEEncode",inputs:{pixels:["13",0],vae:["1",2]}},
      "5":{class_type:"KSampler",inputs:{seed:spec.seed,steps:quality?Math.max(28,spec.steps):photo?Math.max(28,spec.steps):spec.steps,cfg:quality?Math.min(5,spec.cfg):photo?Math.min(7,spec.cfg):spec.cfg,sampler_name:quality?"euler":photo?"dpmpp_2m":spec.sampler_name,scheduler:quality?"normal":photo?"karras":spec.scheduler,denoise:Math.max(0.15,Math.min(0.85,Number(denoise)||0.44)),model,positive:["2",0],negative:["3",0],latent_image:["4",0]}},
      "6":{class_type:(quality||photo)?"VAEDecodeTiled":"VAEDecode",inputs:(quality||photo)?{samples:["5",0],vae:["1",2],tile_size:512,overlap:64,temporal_size:64,temporal_overlap:8}:{samples:["5",0],vae:["1",2]}},
    };
    if(quality){
      workflow["8"]={class_type:"ModelSamplingDiscrete",inputs:{model:["1",0],sampling:"v_prediction",zsnr:true}};
      workflow["9"]={class_type:"UpscaleModelLoader",inputs:{model_name:"RealESRGAN_x4plus_anime_6B.pth"}};
      workflow["10"]={class_type:"ImageUpscaleWithModel",inputs:{upscale_model:["9",0],image:["6",0]}};
      workflow["11"]={class_type:"ImageScale",inputs:{image:["10",0],upscale_method:"lanczos",width:finalWidth,height:finalHeight,crop:"disabled"}};
      workflow["7"]={class_type:"SaveImage",inputs:{filename_prefix:"DailyAgent-Edit-HQ",images:["11",0]}};
    }else workflow["7"]={class_type:"SaveImage",inputs:{filename_prefix:photo?"DailyAgent-Photo-Edit":"DailyAgent-Edit",images:["6",0]}};
    return workflow;
  }
  async uploadSourceImage(encoded) {
    const bytes=Buffer.from(encoded,'base64');
    const isJpeg=bytes[0]===0xff&&bytes[1]===0xd8;
    const isWebp=bytes.subarray(8,12).toString()==='WEBP';
    const extension=isJpeg?'jpg':isWebp?'webp':'png';
    const form=new FormData();
    form.append('image',new Blob([bytes],{type:isJpeg?'image/jpeg':isWebp?'image/webp':'image/png'}),`DailyAgent-${randomUUID()}.${extension}`);
    form.append('type','input');form.append('overwrite','true');
    const response=await this.request('/upload/image',{method:'POST',body:form},60000);
    const result=await response.json();
    if(!result.name)throw Error('ComfyUI 未接受來源圖片。');
    return result.subfolder?`${result.subfolder}/${result.name}`:result.name;
  }
  qualityWorkflow(spec) {
    const finalWidth=Math.min(1792,Math.round(spec.width*1.5/64)*64);
    const finalHeight=Math.min(1792,Math.round(spec.height*1.5/64)*64);
    // V-Pred reacts strongly to generic "crisp lineart" boosters: with luminous
    // subjects they can collapse the image into an overexposed outline.  The
    // planner already emits model-native quality tags, so preserve its prompt.
    const qualityPrompt=spec.prompt;
    const qualityNegative=spec.negative_prompt;
    return {
      "1":{class_type:"CheckpointLoaderSimple",inputs:{ckpt_name:path.basename(this.checkpoint)}},
      "8":{class_type:"ModelSamplingDiscrete",inputs:{model:["1",0],sampling:"v_prediction",zsnr:true}},
      "2":{class_type:"CLIPTextEncode",inputs:{text:qualityPrompt,clip:["1",1]}},
      "3":{class_type:"CLIPTextEncode",inputs:{text:qualityNegative,clip:["1",1]}},
      "4":{class_type:"EmptyLatentImage",inputs:{width:spec.width,height:spec.height,batch_size:1}},
      "5":{class_type:"KSampler",inputs:{seed:spec.seed,steps:Math.max(28,spec.steps),cfg:Math.min(5,spec.cfg),sampler_name:"euler",scheduler:"normal",denoise:1,model:["8",0],positive:["2",0],negative:["3",0],latent_image:["4",0]}},
      "6":{class_type:"VAEDecodeTiled",inputs:{samples:["5",0],vae:["1",2],tile_size:512,overlap:64,temporal_size:64,temporal_overlap:8}},
      "9":{class_type:"UpscaleModelLoader",inputs:{model_name:"RealESRGAN_x4plus_anime_6B.pth"}},
      "10":{class_type:"ImageUpscaleWithModel",inputs:{upscale_model:["9",0],image:["6",0]}},
      "11":{class_type:"ImageScale",inputs:{image:["10",0],upscale_method:"lanczos",width:finalWidth,height:finalHeight,crop:"disabled"}},
      "7":{class_type:"SaveImage",inputs:{filename_prefix:"DailyAgent-HQ",images:["11",0]}},
    };
  }
  photoWorkflow(spec) {
    const standardAdult=/pornmaster/i.test(path.basename(this.checkpoint));
    return {
      "1":{class_type:"CheckpointLoaderSimple",inputs:{ckpt_name:path.basename(this.checkpoint)}},
      "2":{class_type:"CLIPTextEncode",inputs:{text:spec.prompt,clip:["1",1]}},
      "3":{class_type:"CLIPTextEncode",inputs:{text:spec.negative_prompt,clip:["1",1]}},
      "4":{class_type:"EmptyLatentImage",inputs:{width:spec.width,height:spec.height,batch_size:1}},
      "5":{class_type:"KSampler",inputs:{seed:spec.seed,steps:Math.max(28,spec.steps),cfg:standardAdult?Math.min(6,spec.cfg):Math.min(7,spec.cfg),sampler_name:standardAdult?"euler_ancestral":"dpmpp_2m",scheduler:standardAdult?"sgm_uniform":"karras",denoise:1,model:["1",0],positive:["2",0],negative:["3",0],latent_image:["4",0]}},
      "6":{class_type:"VAEDecodeTiled",inputs:{samples:["5",0],vae:["1",2],tile_size:512,overlap:64,temporal_size:64,temporal_overlap:8}},
      "7":{class_type:"SaveImage",inputs:{filename_prefix:"DailyAgent-Photo",images:["6",0]}},
    };
  }
  async generate(input, { onProgress, sourceImage, denoise } = {}) {
    const spec = normalizeGenerationSpec(input);
    const clientId = randomUUID();
    const sourceName=sourceImage?await this.uploadSourceImage(sourceImage):null;
    const workflow=sourceName?this.editWorkflow(spec,sourceName,denoise):this.workflow(spec);
    const response = await this.request("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: clientId }) });
    const { prompt_id: promptId } = await response.json();
    if (!promptId) throw Error("ComfyUI 未接受生圖任務。");
    const until = Date.now() + 10 * 60_000;
    while (Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const history = await (await this.request(`/history/${encodeURIComponent(promptId)}`, {}, 10000)).json();
      const item = history[promptId];
      if (!item) { onProgress?.({ stage: "sampling" }); continue; }
      if (item.status?.status_str === "error") throw Error("ComfyUI 生圖失敗。");
      const image = Object.values(item.outputs || {}).flatMap((x) => x.images || [])[0];
      if (!image) continue;
      const bytes = Buffer.from(await (await this.request(`/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || "")}&type=${encodeURIComponent(image.type || "output")}`, {}, 60000)).arrayBuffer());
      fs.mkdirSync(this.outputDir, { recursive: true });
      const file = path.join(this.outputDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${promptId}.png`);
      fs.writeFileSync(file, bytes);
      const outputSpec=this.profile==='quality'
        ?{...spec,width:Math.min(1792,Math.round(spec.width*1.5/64)*64),height:Math.min(1792,Math.round(spec.height*1.5/64)*64),profile:'quality',sampler_name:'euler',scheduler:'normal'}
        :this.profile==='photo'
          ?(/pornmaster/i.test(path.basename(this.checkpoint))
            ?{...spec,steps:Math.max(28,spec.steps),cfg:Math.min(6,spec.cfg),sampler_name:'euler_ancestral',scheduler:'sgm_uniform',profile:'photo'}
            :{...spec,steps:Math.max(28,spec.steps),cfg:Math.min(7,spec.cfg),sampler_name:'dpmpp_2m',scheduler:'karras',profile:'photo'})
          :{...spec,profile:'fast'};
      return { file, bytes, spec:outputSpec, prompt_id: promptId };
    }
    throw Error("生圖逾時，已中止等待。");
  }
  async unload() {
    try { await this.request("/free", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unload_models: true, free_memory: true }) }, 4000); } catch {}
    const pid = this.process?.pid;
    if (pid) {
      try { await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 15000 }); } catch {}
    }
    this.process = null;
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      if (!(await this.status())) return;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw Error("ComfyUI 關閉後仍占用服務埠，GPU 尚未確認釋放。");
  }
}
