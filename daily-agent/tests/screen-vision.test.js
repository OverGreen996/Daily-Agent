import test from 'node:test';
import assert from 'node:assert/strict';
import {ScreenVision} from '../idle/ScreenVision.js';
import {LightPerception} from '../idle/LightPerception.js';
import {IdleCompanion} from '../idle/IdleCompanion.js';
import {ModelRole} from '../models/ModelLifecycleManager.js';
function fixture(){
 const calls=[];let resident=false,owner=null,cancelChat;
 const runtime={model:'qwen-test',load:async()=>{resident=true;},unload:async()=>{resident=false;},status:async()=>resident?{size_vram:4000}:null,cancel(){cancelChat?.();},chat:async messages=>{assert.equal(messages.at(-1).images.length,1);return {message:{content:'{"summary":"畫面顯示圖層與角色草稿","category":"art","confidence":0.9}'}};}};
 const lifecycle={get_active_model:()=>({gpu_owner:owner,loaded_roles:resident?[ModelRole.VISION_MODEL]:[]}),save_runtime_state:async task=>{calls.push('save');assert.deepEqual(task,{kind:'screen-observation'});},restore_runtime_state:async()=>calls.push('restore'),load_model:async role=>{assert.equal(role,ModelRole.VISION_MODEL);owner=role;calls.push('gpu-load');await runtime.load();},unload_model:async role=>{assert.equal(role,ModelRole.VISION_MODEL);calls.push('gpu-unload');await runtime.unload();assert.equal(await runtime.status(),null);owner=null;}};
 const vision=new ScreenVision({runtime,lifecycle,bus:{publish(){}},timeoutMs:1000});
 return {calls,runtime,lifecycle,vision,setCancel(fn){cancelChat=fn;},get resident(){return resident;}};
}
test('GPU observation owns a separate turn, saves/restores context and verifies unload',async()=>{
 const f=fixture();const result=await f.vision.observe({image:'fixture'});assert.equal(result.category,'art');assert.deepEqual(f.calls,['save','gpu-load','gpu-unload','restore']);assert.equal(f.resident,false);assert.equal(f.vision.status().last.unloaded,true);assert.equal(f.vision.status().phase,'idle');
});
test('invalid vision JSON and load failures always unload; failed unload cannot report success',async()=>{
 for(const mode of ['parse','load']){const f=fixture();if(mode==='parse')f.runtime.chat=async()=>({message:{content:'bad'}});else f.runtime.load=async()=>{throw Error('load failed');};await assert.rejects(()=>f.vision.observe({image:'fixture'}));assert.ok(f.calls.includes('gpu-unload'));assert.equal(f.resident,false);}
 const f=fixture();f.runtime.unload=async()=>{throw Error('unload failed');};await assert.rejects(()=>f.vision.observe({image:'fixture'}),/unload failed/);assert.equal(f.vision.status().last.unloaded,false);assert.equal(f.lifecycle.get_active_model().gpu_owner,ModelRole.VISION_MODEL);
});
test('user cancellation aborts background vision, unloads and produces no stale observation',async()=>{
 const f=fixture();let ready;const entered=new Promise(r=>ready=r);f.runtime.chat=async()=>new Promise((resolve,reject)=>{f.setCancel(()=>reject(Object.assign(Error('cancelled'),{name:'AbortError'})));ready();});
 const task=f.vision.observe({image:'fixture'});await entered;f.vision.cancel();await assert.rejects(task,/cancelled/);assert.equal(f.resident,false);assert.equal(f.vision.status().last,null);assert.ok(f.calls.includes('restore'));
});
test('screen pipeline unloads GPU before handing observation to CPU-only companion',async()=>{
 const f=fixture();const idle={load:async()=>{assert.equal(f.resident,false);f.calls.push('cpu-load');},unload:async()=>f.calls.push('cpu-unload'),cancel(){},chat:async()=>({message:{content:'{"should_speak":true,"support":"角色草稿","text":"這次想畫什麼樣的角色呀？"}'}})};
 const events=[];const memory={working:{list:()=>[],add(){}},pins:{all:()=>[]},entities:{get:()=>({})},habits:{observe(){}}};
 const c=new IdleCompanion({runtime:idle,memory,browser:{close:async()=>{}},embedding:{embed:async()=>[[1,0]]},config:{perception:true,lightPerception:true,screenVision:true,memoryCompanion:false},bus:{publish:(type,data)=>events.push({type,data})},perception:{snapshot:()=>({process:'Editor',title:'有標題也看圖',since:Date.now(),idleMs:0})},weather:{refresh:async()=>[]}});
 c.lightPerception=new LightPerception({capture:async()=>({process:'Editor',image:'fixture'}),ocr:{recognize:async()=>{throw Error('GPU mode must not do duplicate OCR');}}});c.lightPerception.vision=f.vision;
 const text=await c.tick(600000);assert.equal(text,'這次想畫什麼樣的角色呀？');assert.ok(f.calls.indexOf('gpu-unload')<f.calls.indexOf('cpu-load'));assert.deepEqual(f.calls.slice(-2),['cpu-load','cpu-unload']);assert.equal(events.filter(e=>e.type==='pet_bubble').length,1);
});
