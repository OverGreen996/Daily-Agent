export function observedGameVersions(text){
 const out=[];
 for(const m of String(text||'').matchAll(/(?:patch|version|hotfix|版本|更新|Ver\.?)[\s:：v-]{0,8}(\d+(?:\.\d+){1,4})(?!\d|\.\d)/gi))out.push(m[1]);
 return [...new Set(out)];
}
function compare(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)-(y[i]||0);}return 0;}
const NOISE=new Set('the of a an and to for how latest current patch notes update updates pc steam guide walkthrough game ranger progression pre hardmode quality modules recycling stress healing savage raid unlock requirements expedition rewards honour mode legendary actions build best weapons weapon boss boons combat ironclad exhaust deck breeding mechanics'.split(' '));
export function gameIdentityMatches(queryHint,result){
 const clean=s=>String(s||'').toLowerCase().replace(/['’]s\b/g,'').replace(/\bii\b/g,'2').replace(/\biii\b/g,'3').replace(/[^\p{L}\p{N}]+/gu,' ');
 const tokens=clean(queryHint).split(/\s+/).filter(t=>t&&!NOISE.has(t));
 const distinctive=tokens.filter(t=>!/^\d+$/.test(t)).slice(0,2),hay=clean([result.title,result.url,result.body||result.content].join(' '));
 // Discovery snippets must identify the requested game, not merely "Dungeon 2".
 if(distinctive.length&&!distinctive.every(t=>hay.includes(t)))return false;
 const headline=clean(result.title+' '+result.url),hint=clean(queryHint);
 if(!/\bmod\b|\bmods\b|modded|modloader|模組|downfall|calamity/i.test(queryHint)&&/\bmod\b|\bmods\b|modded|modloader|模組|downfall|calamity/i.test(headline))return false;
 const expected=tokens.find(t=>/^\d+$/.test(t));
 const last=distinctive.at(-1);
 const sequel=last&&headline.match(new RegExp(last+'(?:\\s+(?:the|of|a))*\\s*(\\d+|iv|iii|ii)\\b'))?.[1];
 if(sequel&&sequel!==(expected||'1')&&!hint.includes(last+' '+sequel))return false;
 return true;
}
export function checkGameVersions(plan,guides,updates,{now=Date.now()}={}){
 const official=(updates||[]).filter(r=>r.reliability==='primary'&&!/wiki\.gg|fandom\.com|\/\/wiki\.|\.wiki\//i.test(r.url)&&['page','article'].includes(r.coverage)&&gameIdentityMatches(plan.title_hint,r)&&!/\bbeta\b|preview|test server|測試服/i.test(r.title+' '+r.url));
 const candidates=official.flatMap(r=>observedGameVersions(r.title+' '+r.body).map(version=>({version,url:r.url,date:r.modified_at||r.date||null,platform_scope:'not-verified'})));
 candidates.sort((a,b)=>compare(b.version,a.version));
 const latest=candidates[0]||null,updateDate=Math.max(0,...official.map(r=>Date.parse(r.modified_at||r.date)).filter(t=>Number.isFinite(t)&&t<=now));
 const rows=(guides||[]).map(r=>{
  const observed=observedGameVersions(r.title+' '+r.body),stamp=Date.parse(r.modified_at||r.date),knownDate=Number.isFinite(stamp)&&stamp<=now;
  let status='version-unknown';
  if(observed.length&&latest)status=observed.some(v=>compare(v,latest.version)===0)?'matches-observed-update':observed.every(v=>compare(v,latest.version)<0)?'older-than-observed-update':'version-conflict';
  else if(observed.length)status='latest-update-not-read';
  if(plan.requested_version&&observed.length&&!observed.includes(plan.requested_version))status='requested-version-not-confirmed';
  return {url:r.url,versions:observed,status,published_at:r.date||null,updated_at:r.modified_at||null,
   date_age_days:knownDate?Math.floor((now-stamp)/86400000):null,
   predates_observed_update:knownDate&&updateDate>0?stamp<updateDate:null,
   requires_recheck:status!=='matches-observed-update'||!!(knownDate&&updateDate>stamp)};
 });
 return {requested_version:plan.requested_version,latest_observed_version:latest?.version||null,
  latest_source_url:latest?.url||null,latest_status:latest?'observed-in-official-page':'not-verified',
  latest_is_exhaustively_verified:false,platform_compatibility_verified:false,
  guides:rows,mechanics_compatibility_verified:false,
  notice:'網站更新日期只供新舊判斷。版本相同仍須比對攻略機制；未核對全部官方更新與平台，不能保證找到真正最新版本。'};
}
