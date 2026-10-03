import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SearXNGProvider,LightSearchBrowser} from './SearXNGProvider.js';
import {BrowserAgent} from './BrowserAgent.js';
import {buildEvidencePack} from './Evidence.js';
import {compactQuery} from './QueryText.js';
import {inferIntent} from './SearchPlanner.js';
import {configuredDomainOverrides} from './SourceRegistry.js';
import {SteamStore,steamEvidence,steamRequest} from './SteamStore.js';
import {sourceBudget} from './SourceBudget.js';
const here=path.dirname(fileURLToPath(import.meta.url));
export function normalizedQuery(q){return String(q).normalize('NFKC').replace(/(\d{3,5})(ti)\b/gi,'$1 $2').replace(/\s+/g,' ').trim().toLowerCase();}
function ttlFor(q){const intent=inferIntent(q);return intent==='news'?60000:['game','price','store-sale'].includes(intent)||/最新|latest|最近|version|版本|driver|update|release/i.test(q)?120000:/docs|documentation|文件|教學/i.test(q)?3600000:900000;}
export class XngCore {
 constructor({endpoint='http://127.0.0.1:8888',stateDir=path.resolve(here,'../.runtime'),overrides=null,provider=null,browser=null,search=null,steam=null,maxPending=4,budgets={fast:8000,normal:25000,deep:40000}}={}){
  const u=new URL(endpoint);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||!['http:','https:'].includes(u.protocol))throw Error('XNG upstream must be a local HTTP(S) SearXNG instance');
  Object.assign(this,{endpoint,stateDir,maxPending,budgets});this.health=new Map();this.rawCache=new Map();this.cache=new Map();this.inFlight=new Map();this.queue=Promise.resolve();this.pending=0;this.active=0;this.closed=false;
  this.metrics={requests:0,cache_hits:0,deduplicated_requests:0,degraded:0,failures:0};this.latencies=[];
  try{const saved=JSON.parse(fs.readFileSync(path.join(stateDir,'engine-health.json'),'utf8'));for(const [name,s] of Object.entries(saved.health||{}).slice(0,32))if(Date.now()-saved.saved_at<86400000)this.health.set(name,s);}catch{}
  this.overrides=overrides??configuredDomainOverrides();
  this.provider=provider||new SearXNGProvider({endpoint,engineHealth:this.health,searchCache:this.rawCache});
  this.searcher=search||new LightSearchBrowser(this.provider,browser||new BrowserAgent({idleMs:1000}));
  this.steam=steam||new SteamStore();
 }
 status(){const sorted=[...this.latencies].sort((a,b)=>a-b);return {service:'XNG AI Search Hub',schema_version:1,paid:false,models_loaded:0,endpoint:this.endpoint,active:this.active,pending:this.pending,cache_entries:this.cache.size,raw_cache_entries:this.rawCache.size,
  memory_rss_bytes:process.memoryUsage().rss,heap_used_bytes:process.memoryUsage().heapUsed,uptime_seconds:Math.floor(process.uptime()),metrics:{...this.metrics},recent_latency_ms:{samples:sorted.length,p50:sorted[Math.floor(sorted.length*.5)]??null,p95:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]??null},
  engine_health:this.provider.healthSnapshot?.()||Object.fromEntries(this.health),steam_store:this.steam.status?.()||null,state_directory:this.stateDir};}
 persistHealth(){
  try{fs.mkdirSync(this.stateDir,{recursive:true});const file=path.join(this.stateDir,'engine-health.json');fs.writeFileSync(file+'.tmp',JSON.stringify({schema_version:1,saved_at:Date.now(),health:Object.fromEntries(this.provider.engineHealth||this.health)}));fs.renameSync(file+'.tmp',file);}catch{this.health_persistence_failed=true;}
 }
 async search(query,{mode='normal',limit,sourceLimit,debug=false}={}){
  if(this.closed)throw Object.assign(Error('XNG is closing'),{status:503});
  if(typeof query!=='string'||!query.trim()||query.length>2000)throw Object.assign(Error('query must be 1–2000 characters'),{status:400});
  if(!['fast','normal','deep'].includes(mode))throw Object.assign(Error('mode must be fast, normal or deep'),{status:400});
  const budget=sourceBudget(mode,limit,sourceLimit);limit=budget.returned;
  const original=query.trim(),processed=compactQuery(original).slice(0,500),key=JSON.stringify([normalizedQuery(processed),mode,limit,budget.collected]),started=Date.now();this.metrics.requests++;
  const cached=this.cache.get(key);
  const format=(value,hit=false)=>{
   const out=structuredClone(value.pack);out.query=original;out.cache={hit,age_ms:hit?Date.now()-value.created_at:0};
   if(processed.length<compactQuery(original).length)out.query_processing={method:'local-rules',truncated:true,notice:'查詢超過本地搜尋核心限制，已縮短；請檢查重要條件是否保留。'};
   if(debug)out.debug={...value.diagnostics,cache_hit:hit,original_query:original,processed_query:processed,request_elapsed_ms:Date.now()-started};
   return out;
  };
  if(cached?.expires>Date.now()){this.metrics.cache_hits++;return format(cached,true);}
  if(this.inFlight.has(key)){this.metrics.deduplicated_requests++;return format(await this.inFlight.get(key));}
  if(this.pending>=this.maxPending)throw Object.assign(Error('搜尋佇列已滿，請稍後重試'),{status:429});
  this.pending++;
  const task=this.queue.then(async()=>{
   this.pending--;if(this.closed)throw Object.assign(Error('XNG is closing'),{status:503});this.active++;const jobStart=Date.now();let partial=null,timer,raw,degraded=false;
   try{
    const storeRequested=steamRequest(original);let storeTask,storePartial;
    const mergeStore=(r,store)=>store?{...r,results:[...steamEvidence(store),...(r.results||[]).filter(x=>!x.steam_product&&!(store.products?.length&&store.constraints?.price_only))],steam:store}:r;
    const startStore=r=>storeTask||=this.steam.enrich(r,original,{mode,signal:r.store_direct?undefined:this.provider.controller?.signal})
     .catch(e=>({provider:'Steam public storefront',paid:false,status:'unavailable',region:'TW',currency:'TWD',products:[],errors:[String(e.message).slice(0,100)]}))
     .then(store=>{storePartial=store;partial=mergeStore(partial||r,store);return store;});
    const searchTask=(async()=>{
     if(storeRequested?.price_only&&!storeRequested.unsupported_region&&!storeRequested.historical){
      const direct={results:[],provider:'XNG Steam public storefront',store_direct:true},store=await startStore(direct);
      if(store?.products?.length)return mergeStore(direct,store);
      // Public storefront discovery can fail or omit a title. Ordinary search
      // may discover an official product ID, so keep the free fallback path.
      storeTask=null;storePartial=undefined;partial=null;
     }
     let result;try{result=await this.searcher.search(processed,{mode,limit:budget.collected,structuredStore:!!storeRequested,onProgress:r=>{
      partial=mergeStore(r,storePartial);
      if(storeRequested&&(mode==='fast'||r.results?.some(x=>x.coverage==='page'||x.coverage==='article')))startStore(r);
     }});}catch(e){if(!storeRequested||e.name==='AbortError')throw e;result=partial||{results:[],provider:'SearXNG',notice:'一般搜尋未取得完整資料；使用Steam官方來源核對。'};}
     if(storeRequested)result=mergeStore(result,await startStore(result));
     partial=result;return result;
    })();
    const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve({timeout:true}),this.budgets[mode]);});
    const winner=await Promise.race([searchTask.then(value=>({value}),error=>({failed:true,error_name:error.name,error_message:String(error.message).slice(0,200)})),timeout]);
    clearTimeout(timer);
    if(winner.timeout){this.steam.cancel?.();await Promise.race([this.searcher.close().catch(()=>{}),new Promise(resolve=>{const t=setTimeout(resolve,1500);t.unref?.();})]);degraded=true;raw=partial||{results:[],provider:'SearXNG',notice:'搜尋超過本次時間預算，僅提供已取得的證據。'};}
    else if(winner.failed){degraded=true;this.metrics.failures++;raw=partial||{results:[],provider:'SearXNG',notice:'上游未提供可用結果，本次沒有足夠證據；可稍後重試或提供官方網址。'};}
    else raw=winner.value;
    if(degraded)this.metrics.degraded++;
    const {pack,diagnostics}=buildEvidencePack(raw,original,{mode,limit,sourceLimit:budget.collected,overrides:this.overrides,degraded});
    const priceStamps=(raw.steam?.products||[]).flatMap(p=>[p.price,...(p.purchase_options||[]).map(o=>o.price)]).map(p=>Date.parse(p.checked_at)+120000).filter(Number.isFinite);
    const value={pack,diagnostics:{...diagnostics,...(winner.failed?{failure:{name:winner.error_name,message:winner.error_message}}:{}),expanded_queries:raw.search_queries||[],upstream_requests:raw.store_direct?[]:structuredClone(this.provider.trace||[]),engine_health:this.provider.healthSnapshot?.()||{},elapsed_ms:Date.now()-jobStart,mode,cache_hit:false},created_at:Date.now(),expires:Math.min(Date.now()+ttlFor(original),...priceStamps)};
    if(pack.evidence.length&&!degraded&&pack.quality.confidence!=='LOW'){
     this.cache.set(key,value);while(this.cache.size>128)this.cache.delete(this.cache.keys().next().value);
     while([...this.cache.values()].reduce((n,v)=>n+JSON.stringify(v.pack).length,0)>4e6)this.cache.delete(this.cache.keys().next().value);
    }
    return value;
   }finally{clearTimeout(timer);this.active--;this.persistHealth();this.latencies.push(Date.now()-jobStart);if(this.latencies.length>64)this.latencies.shift();}
  });
  this.queue=task.catch(()=>{});this.inFlight.set(key,task);
  try{return format(await task);}finally{this.inFlight.delete(key);}
 }
 async close(){this.closed=true;this.steam.cancel?.();await this.searcher.close();this.persistHealth();}
}
