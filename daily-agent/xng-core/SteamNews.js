import {SteamStore,steamLinks} from './SteamStore.js';
import {gamePlan,isGameQuery} from './GameSearch.js';
import {gameIdentityMatches} from './GameVersionCheck.js';

const clean=s=>String(s||'').replace(/\[(?:[^\]]+)\]/g,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/[ \t]+/g,' ').trim();
export class SteamNews extends SteamStore {
 async enrich(raw,query,{mode='normal',signal}={}){
  if(mode==='fast'||!isGameQuery(query))return [];
  const hint=gamePlan(query).title_hint;if(!hint||hint.length<3)return [];
  const controller=new AbortController();this.controllers.add(controller);
  const job={signal:AbortSignal.any([controller.signal,AbortSignal.timeout(4500),...(signal?[signal]:[])]),requests:0,maxRequests:5};
  const ids=new Set(),out=[];
  for(const r of [...(raw.results||[]),...(raw.game_updates||[])])if(gameIdentityMatches(hint,{...r,body:'',content:''}))for(const l of steamLinks(r.url))if(l.type==='app')ids.add(l.id);
  try{
   if(!ids.size){const s=await this.json('/api/storesearch',{term:hint},job);for(const x of (s.data?.items||[]).slice(0,5))if(gameIdentityMatches(hint,{title:x.name,url:'',body:''})&&Number.isSafeInteger(x.id))ids.add(x.id);}
   for(const id of [...ids].slice(0,2)){
    // Identity and announcements are global. TW store availability must not
    // suppress news; these fields are never used for regional price verification.
    const r=await this.json('/api/appdetails',{appids:id},job,{identity:true}),app=r.data?.[id]?.data;
    if(!r.data?.[id]?.success||Number(app?.steam_appid)!==id||app.type!=='game'||!gameIdentityMatches(hint,{title:app.name,url:'',body:''}))continue;
    const n=await this.json('/ISteamNews/GetNewsForApp/v2/',{appid:id,count:40,maxlength:0,feeds:'steam_community_announcements'},job,{news:true});
    if(Number(n.data?.appnews?.appid)!==id)continue;
    for(const item of n.data.appnews.newsitems||[]){
     if(item.feedname!=='steam_community_announcements'||Number(item.appid)!==id||!Number.isFinite(item.date)||item.date*1000>this.now())continue;
     const title=clean(item.title),body=clean(item.contents);
     if(!/patch|update|hotfix|修正|更新|補丁|\b\d+(?:\.\d+){1,4}\b/i.test(title)||body.length<80)continue;
     const gid=String(item.gid||'');if(!/^\d{1,24}$/.test(gid))continue;
     out.push({title:app.name+' — '+title,url:`https://store.steampowered.com/news/app/${id}/view/${gid}`,body:body.slice(0,18000),body_truncated:body.length>18000,date:new Date(item.date*1000).toISOString(),retrieved_at:n.checked_at,reader:'steam-public-news',coverage:'article',reliability:'primary',steam_app_id:id,official_feed:true});
    }
    if(out.length)break;
   }
  }catch(e){if(signal?.aborted)throw e;}
  finally{this.controllers.delete(controller);}
  return out.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,3);
 }
}
