import {publisherKey,gameSources} from './SourceRegistry.js';
import {checkGameVersions} from './GameVersionCheck.js';
import {isStoreSaleQuery} from './QueryText.js';

const GUIDE=/攻略|配裝|流派|任務|支線|主線|副本|掉落|武器|裝備|技能|天賦|符文|解鎖|遊戲|通關|打法|\bboss\b|\bwalkthrough\b|\bquest\b|\bbuilds?\b|\bgame\b|\bguide\b|wiki\.gg|\bfandom\b/i;
const DEV=/godot|unity|unreal|docker|npm|sdk|api|程式|開發|編譯/i;
const PLATFORM=/\b(?:PC|Steam|PS[45]|PlayStation(?:\s*[45])?|Xbox(?:\s*(?:One|Series\s*[XS]))?|Switch(?:\s*2)?|Android|iOS)\b/gi;
export function isGameQuery(query){
 const q=String(query||'');
 if(isStoreSaleQuery(q))return false;
 return /remnant|elden\s*ring|hades|diablo|monster\s*hunter|stardew|minecraft|baldur|魔物獵人|艾爾登|原神|鳴潮|終末地|星露谷|暗黑破壞神/i.test(q)|| (GUIDE.test(q)&&(!DEV.test(q)||/攻略|任務|boss|掉落|配裝/i.test(q)));
}
export function isGameGuideQuery(query){
 return isGameQuery(query)&&/攻略|配裝|流派|任務|掉落|武器|裝備|技能|解鎖|打法|通關|wiki|boss|walkthrough|quest|build|guide|boons|weapon|beat|defeat|location|unlock/i.test(String(query));
}
export function gamePlan(query){
 const q=String(query), quoted=q.match(/[《「"]([^》」"]{2,80})[》」"]/)?.[1];
 let title=quoted||q.replace(/^(?:請|幫我|搜尋|查詢|查|找|想知道|我要|我想|how to)\s*/gi,'').replace(/site:\S+|\bwiki\.gg\b/gi,'').trim();
 if(!quoted){
  // A numbered title is a useful hint, not proof that the game was identified.
  const numbered=title.match(/^(.{2,60}?\b(?:\d+|II|III|IV|VI|VII|VIII|IX|XI|XII|XVI)\b)(?!\.)/);
  if(numbered)title=numbered[1];
  else {
   const englishPrefix=title.match(/^([A-Za-z0-9][A-Za-z0-9:'’\.\- ]+?)\s+(?=[\p{Script=Han}])/u)?.[1];
   title=(englishPrefix||title).split(/最新|目前|攻略|初期|新手|品質|配裝|流派|任務|支線|主線|副本|掉落|武器|裝備|技能|解鎖|通關|打法|\b(?:best|latest|current|boss|guide|build|builds|quest|walkthrough|boons|weapon|weapons|ranger|progression|exhaust|breeding|mechanics|quality|healing)\b/i)[0].trim();
  }
 }
 title=title.replace(PLATFORM,'').replace(/[?？:：,，]+$/,'').trim().slice(0,80);
 const platform=[...new Set(q.match(PLATFORM)||[])];
 const version=q.match(/(?:版本|version|patch|v)\s*[:：]?\s*(\d+(?:\.\d+){1,3})/i)?.[1]||q.match(/\b(\d+(?:\.\d+){1,3})\b/)?.[1]||null;
 let goal='mechanics';
 if(/配裝|流派|build|天賦|符文/i.test(q))goal='build';
 else if(/取得|獲得|哪裡|掉落|解鎖|獲取|獲得|\bget\b|location|unlock/i.test(q))goal='acquisition';
 else if(/boss|打法|打不過|頭目|王怎麼|beat|defeat/i.test(q))goal='combat';
 else if(/任務|支線|主線|quest|walkthrough/i.test(q))goal='quest';
 return {
  title_hint:title||null,title_hint_origin:quoted?'user-explicit':'heuristic',
  platform,requested_version:version,goal,
  needs:['game-identity','version-and-platform','prerequisites','steps-or-mechanics','exceptions','current-update-context'],
  update_query:(title||q)+' '+(platform.length?platform.join(' ')+' ':'')+'latest patch notes updates',
  update_site:gameSources(q)?.official||null,
  answer_sections:goal==='build'?['適用版本與平台','核心機制與選擇理由','配裝／技能與替代方案','取得條件','操作循環與例外']:
   goal==='combat'?['適用版本與平台','前置準備','階段與招式應對','失敗原因與替代打法','限制與例外']:
   ['適用版本與平台','前置條件','依序步驟與地點','分支／不可逆選擇','限制與例外']
 };
}
export function gameEvidence(query,results,updateResults=[]){
 const plan=gamePlan(query), pages=(results||[]).filter(r=>r.coverage==='page'||r.coverage==='article');
 const versions=pages.map(r=>({url:r.url,versions:[...new Set((String(r.title)+' '+String(r.body)).match(/(?:version|patch|版本|更新)\s*[:：v]?\s*\d+(?:\.\d+){1,3}/gi)||[])]})).filter(r=>r.versions.length);
 const updates=(updateResults||[]).map(r=>({title:r.title,url:r.url,date:r.date||null,modified_at:r.modified_at||null,coverage:r.coverage,reliability:r.reliability}));
 // Search results are discovery leads. A timestamp alone cannot prove patch compatibility.
 const checked=updates.some(r=>['page','article'].includes(r.coverage)&&r.reliability==='primary'&&!/wiki\.gg|fandom\.com|\/\/wiki\.|\.wiki\//i.test(r.url)&&/patch|update|hotfix|更新|修正|補丁/i.test(r.title+' '+r.url)&&Number.isFinite(Date.parse(r.modified_at||r.date))&&Date.now()-Date.parse(r.modified_at||r.date)<=180*86400000&&Date.parse(r.modified_at||r.date)<=Date.now());
 return {plan,guide_pages:pages.length,guide_publishers:[...new Set(pages.map(r=>publisherKey(r.url)))],
  observed_versions:versions,update_sources:updates,update_status:checked?'primary-update-read':'not-verified',
  compatibility_verified:false,version_check:checkGameVersions(plan,pages,updateResults),
  limitations:checked?['更新已讀取；仍須比對更新是否影響本攻略。']:['尚未完整核對最新更新，不能保證舊攻略與目前版本相容。']};
}
