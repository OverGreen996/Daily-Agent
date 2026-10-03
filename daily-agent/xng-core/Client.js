export class XngHubClient {
 constructor({endpoint='http://127.0.0.1:8889',fallback=null,fetcher=fetch}={}){
  const u=new URL(endpoint);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||!['http:','https:'].includes(u.protocol))throw Error('XNG Hub must use a local HTTP(S) endpoint');
  Object.assign(this,{endpoint:endpoint.replace(/\/$/,''),fallback,fetcher});this.controllers=new Set();this.lastProvider=null;
 }
 status(){return {provider:'XNG AI Search Hub',configured:true,paid:false,endpoint:this.endpoint,lastProvider:this.lastProvider,shared_core:true};}
 async search(query,{limit=3,mode='normal'}={}){
  const controller=new AbortController();this.controllers.add(controller);
  try{
   const response=await this.fetcher(this.endpoint+'/ai/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,limit,mode}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(mode==='deep'?45000:30000)])});
   if(!response.ok)throw Object.assign(Error('XNG Hub HTTP '+response.status),{status:response.status});
   const pack=await response.json();if(pack.schema_version!==1||pack.paid!==false||!Array.isArray(pack.evidence))throw Error('Invalid XNG evidence contract');
   const map=r=>({title:r.title,url:r.url,body:(r.passages||[]).join('\n[…]\n'),source:r.publisher,date:r.published_at,modified_at:r.updated_at,retrieved_at:r.retrieved_at,coverage:r.coverage,reliability:r.reliability,source_type:r.source_type,body_is_passages:true,scores:r.scores});
   this.lastProvider='XNG AI Search Hub';
   return {query,provider:this.lastProvider,results:pack.evidence.filter(r=>r.purpose==='answer-evidence').map(map),quality:pack.quality,facts:pack.facts,
    game:pack.game,game_updates:pack.evidence.filter(r=>r.purpose==='update-context').map(map),content_validation:pack.content_validation,notice:pack.notice,cache_hit:pack.cache?.hit,degraded:pack.degraded};
  }catch(e){
   if(controller.signal.aborted||e.name==='AbortError'||e.name==='TimeoutError'||[400,413,429].includes(e.status))throw e;
   if(!this.fallback)throw e;
   const result=await this.fallback.search(query,{limit,mode});this.lastProvider=result.provider;
   return {...result,hub_unavailable:true,notice:(result.notice||'')+' 共用 Hub 暫時不可用，本次使用本機免費搜尋備援。'};
  }finally{this.controllers.delete(controller);}
 }
 async close(){for(const c of this.controllers)c.abort();await this.fallback?.close?.();}
}
