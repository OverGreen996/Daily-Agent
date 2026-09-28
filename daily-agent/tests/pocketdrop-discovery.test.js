import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PocketDrop} from '../remote/PocketDrop.js';
import {pocketCandidates,discoverPocketDrop} from '../remote/PocketDiscovery.js';
const original={endpoint:'https://192.168.1.2:3333',certificate_sha256:'a'.repeat(64),credential:'secret',device_id:'original-device',room_id:'original-room',room_name:'Room'};
const snapshot={device_id:original.device_id,room_id:original.room_id,text:'hello',files:[]};
function client(options={}){let saved={...original},writes=0;const p=new PocketDrop('',{store:{load:()=>saved,save:v=>{saved=v;writes++;},clear:()=>saved=null},...options});return {p,saved:()=>saved,writes:()=>writes};}
test('discovery filters app, protocol, identity and public addresses',()=>{
  const service={txt:{app:'PocketDrop',pv:'1',id:original.device_id},port:4444,addresses:['192.168.1.5','8.8.8.8','127.0.0.1','::1','host.invalid','192.168.1.5']};
  assert.deepEqual(pocketCandidates(service,original.device_id),['https://192.168.1.5:4444']);
  for(const txt of [{app:'Other',pv:'1',id:original.device_id},{app:'PocketDrop',pv:'2',id:original.device_id},{app:'PocketDrop',pv:'1',id:'other'}])assert.deepEqual(pocketCandidates({...service,txt},original.device_id),[]);
});
test('bounded multicast scan cleans up browsers and sockets, including failed creation',async()=>{
  let stopped=0,destroyed=0;
  const found=await discoverPocketDrop(original.device_id,{timeoutMs:50,interfaces:{eth:[{family:'IPv4',internal:false,address:'192.168.1.2'}]},createBonjour:()=>({find(_options,up){const b=new EventEmitter();b.stop=()=>stopped++;queueMicrotask(()=>up({txt:{app:'PocketDrop',pv:'1',id:original.device_id},port:5000,addresses:['192.168.1.8']}));return b;},destroy(){destroyed++;}})});
  assert.deepEqual(found,['https://192.168.1.8:5000']);assert.equal(stopped,1);assert.equal(destroyed,1);
});
test('changed endpoint retains original pin and credential and is persisted only after Room validation',async()=>{
  const next='https://192.168.1.8:5000';const {p,saved}=client({discover:async id=>{assert.equal(id,original.device_id);return ['https://8.8.8.8','https://192.168.1.7:5000',next];},request:async c=>{
    assert.equal(c.credential,original.credential);assert.equal(c.certificate_sha256,original.certificate_sha256);
    if(c.endpoint===original.endpoint)throw Error('offline');if(c.endpoint.includes('.7:'))return {...snapshot,room_id:'wrong-room'};return snapshot;
  }});
  assert.deepEqual(await p.state(),snapshot);assert.deepEqual(saved(),{...original,endpoint:next});
});
test('offline Room keeps credentials and concurrent readers share one scan',async()=>{
  let scans=0;const {p,saved,writes}=client({discover:async()=>{scans++;await new Promise(r=>setTimeout(r,10));return [];},request:async()=>{throw Error('offline');}});
  const results=await Promise.allSettled([p.state(),p.state()]);assert.ok(results.every(r=>r.status==='rejected'&&/配對已保留/.test(r.reason.message)));assert.equal(scans,1);assert.equal(writes(),0);assert.deepEqual(saved(),original);
});
test('disconnect during discovery cannot restore an old pairing',async()=>{
  let resume;const {p,saved}=client({discover:()=>new Promise(r=>resume=r),request:async()=>{throw Error('offline');}});
  const pending=p.state();await new Promise(r=>setImmediate(r));p.disconnect();resume(['https://192.168.1.8:5000']);await assert.rejects(pending,/配對已變更/);assert.equal(saved(),null);
});
test('revoked credentials do not trigger discovery or a pairing attempt',async()=>{
  let scans=0;const {p,writes}=client({discover:async()=>{scans++;return [];},request:async()=>{throw Object.assign(Error('revoked'),{code:'POCKET_AUTH'});}});
  await assert.rejects(p.state(),/revoked/);assert.equal(scans,0);assert.equal(writes(),0);
});
test('sharing rediscovers by reading first and never retries an uncertain PUT',async()=>{
  let puts=0;const next='https://192.168.1.8:5000';const {p}=client({discover:async()=>[next],request:async(c,route)=>{
    if(c.endpoint===original.endpoint)throw Error('offline');if(route==='/v1/text'){puts++;throw Error('response lost');}return snapshot;
  }});
  await assert.rejects(p.share('hello'),/未自動重送/);assert.equal(puts,1);
});
