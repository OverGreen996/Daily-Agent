// Local routing hints and publisher identity; never stores facts or credentials.
import fs from 'node:fs';
let domainOverrides={};
try{const data=JSON.parse(fs.readFileSync(new URL('./domain_overrides.json',import.meta.url),'utf8'));if(data&&typeof data==='object'&&!Array.isArray(data))domainOverrides=Object.fromEntries(Object.entries(data).filter(([d,v])=>/^[a-z0-9.-]+$/i.test(d)&&v&&typeof v==='object'&&!Array.isArray(v)));}catch{console.warn('XNG domain overrides unavailable; using default source rules.');}
export function configuredDomainOverrides(){return structuredClone(domainOverrides);}
export function sourceOverride(value){
 let host;try{host=new URL(value).hostname.toLowerCase().replace(/^www\./,'');}catch{host=String(value||'').toLowerCase();}
 return Object.entries(domainOverrides).find(([d])=>host===d||host.endsWith('.'+d))?.[1]||{};
}
export const OFFICIAL_DOMAINS = [
  'apple.com','nvidia.com','amd.com','intel.com','microsoft.com','python.org',
  'nodejs.org','docker.com','kubernetes.io','cloudflare.com','godotengine.org',
  'unity.com','unrealengine.com','epicgames.com','maxon.net','blender.org',
  'metro.taipei','rust-lang.org','rust-lang.github.io','tokio.rs',
  'bandainamcoent.eu','bandainamcoent.com','eldenring.jp','larian.com','baldursgate3.game',
  'monsterhunter.com','capcom.co.jp','supergiantgames.com','stardewvalley.net','minecraft.net',
  'warframe.com','gunfiregames.com','bipm.org','ncl.edu.tw','videolan.org','postgresql.org','sqlite.org','pgbouncer.org',
  'docs.github.com','github.blog','mozilla.org','firefox.com','capcom.com',
  'store.steampowered.com','partner.steamgames.com','astral.sh','factorio.com','teamcherry.com.au','nomanssky.com'
];
// These are routing hints, not stored answers. Unknown games still use discovery.
export const GAME_SOURCES=[
 {match:/no\s*man['’]?s\s*sky|無人深空/i,wiki:'nomanssky.fandom.com',official:'nomanssky.com'},
 {match:/\bfactorio\b|異星工廠/i,wiki:'wiki.factorio.com',official:'factorio.com'},
 {match:/\bsilksong\b|絲之歌/i,wiki:'hollowknight.wiki',official:'teamcherry.com.au'},
 {match:/remnant\s*2|遺跡\s*2/i,wiki:'remnant2.wiki.gg',official:'gunfiregames.com'},
 {match:/elden\s*ring|艾爾登/i,wiki:'eldenring.wiki.fextralife.com',official:'bandainamcoent.eu',exclude:/nightreign|黑夜君臨/i},
 {match:/baldur|博德之門|柏德之門/i,wiki:'bg3.wiki',official:'baldursgate3.game'},
 {match:/monster\s*hunter\s*wilds|魔物獵人.*荒野/i,wiki:'monsterhunterwiki.org',official:'info.monsterhunter.com'},
 {match:/stardew|星露谷/i,wiki:'stardewvalleywiki.com',official:'stardewvalley.net'},
 {match:/minecraft|當個創世神|我的世界/i,wiki:'minecraft.wiki',official:'minecraft.net'},
 {match:/hades\s*(?:II|2)|黑帝斯\s*2|哈迪斯\s*2/i,wiki:'hades.fandom.com',official:'supergiantgames.com'},
 {match:/warframe|戰甲神兵|星際戰甲/i,wiki:'wiki.warframe.com',official:'warframe.com'}
];
export function gameSources(query){return GAME_SOURCES.find(r=>r.match.test(query)&&!r.exclude?.test(query))||null;}
export function curatedGameWiki(host,query){const s=gameSources(query);return !!s&&(host===s.wiki||host.endsWith('.'+s.wiki));}
export const PRODUCT_SITES = [
  [/godot/i,'godotengine.org'],[/zbrush|maxon/i,'maxon.net'],[/nvidia|geforce|rtx/i,'nvidia.com'],
  [/windows|microsoft|dotnet|\.net/i,'learn.microsoft.com'],[/blender/i,'blender.org'],
  [/\buv\b/i,'docs.astral.sh'],[/python/i,'python.org'],[/node(?:\.js|js)/i,'nodejs.org'],[/docker/i,'docs.docker.com'],[/kubernetes/i,'kubernetes.io'],
  [/cloudflare/i,'developers.cloudflare.com'],[/android/i,'developer.android.com'],
  [/\bBIPM\b/i,'bipm.org'],[/國家圖書館/,'ncl.edu.tw'],[/\bVLC\b/i,'videolan.org'],
  [/postgres(?:ql|sql)?/i,'postgresql.org'],[/\bsqlite\b/i,'sqlite.org'],[/pgbouncer/i,'pgbouncer.org'],
  [/github/i,'docs.github.com'],[/firefox|mozilla/i,'firefox.com']
];
export function publisherKey(value) {
  let host; try {host=new URL(value).hostname.toLowerCase().replace(/^www\./,'');} catch {return '';}
  const known=[...OFFICIAL_DOMAINS,...GAME_SOURCES.map(s=>s.wiki),'wiki.gg','fandom.com','technews.tw','ltn.com.tw','cna.com.tw','pchome.com.tw','coolpc.com.tw','autobuy.tw','momoshop.com.tw','momo.com.tw','wikipedia.org'];
  return sourceOverride(value).publisher||known.find(d=>host===d||host.endsWith('.'+d))||host;
}
export function routedQueries(query) {
  const q=String(query), clean=q.replace(/\b(?:latest|official|docs|documentation|setup)\b|最新|官方|文件/gi,' ').replace(/\s+/g,' ').trim();
  if(/\bwsl\b/i.test(q)&&/gpu|cuda|nvidia|顯示卡/i.test(q)) return [
    clean+' site:docs.nvidia.com/cuda/wsl-user-guide',clean+' site:docs.docker.com/desktop/features/gpu'
  ];
  if(/godot/i.test(q)&&/android/i.test(q)&&/C#|\.net/i.test(q)) return [
    clean+' site:docs.godotengine.org',clean+' migration requirements site:docs.godotengine.org'
  ];
  if(/cloudflare/i.test(q)&&/workers\s*ai/i.test(q)&&/pric|費用|免費|額度/i.test(q)) return [clean+' site:developers.cloudflare.com/workers-ai/platform/pricing'];
  return [];
}
// These entry points supplement discovery and must still be fetched successfully.
export function referencePages(query) {
  const q=String(query), pages=[];
  if(/firefox/i.test(q)&&/版本|latest|release|stable|ESR|穩定/i.test(q)&&!/android|mobile|手機/i.test(q))pages.push({url:'https://product-details.mozilla.org/1.0/firefox_versions.json',title:'Mozilla Firefox desktop official stable release and ESR version channels'});
  if(/node(?:\.js|js)/i.test(q)&&/ERR_REQUIRE_ESM/i.test(q))pages.push({url:'https://nodejs.org/api/modules.html',title:'Node.js CommonJS modules require ECMAScript modules ERR_REQUIRE_ESM'});
  if(/kubernetes/i.test(q)&&/CrashLoopBackOff|重啟|重启/i.test(q))pages.push({url:'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/',title:'Kubernetes pod lifecycle CrashLoopBackOff container restart'},{url:'https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/',title:'Kubernetes debug running pod kubectl describe logs --previous'});
  const repo=q.match(/\bgithub(?:\.com\/|\s+)([a-z0-9_.-]+)[/\s]+([a-z0-9_.-]+)/i);
  if(repo&&/release|發布|發行/i.test(q))pages.push({url:`https://github.com/${repo[1]}/${repo[2]}/releases`,title:`GitHub ${repo[1]} ${repo[2]} releases assets ARM64 x64 source`});
  if(/\buv\b/i.test(q)&&/lock|sync|frozen/i.test(q))pages.push({url:'https://docs.astral.sh/uv/concepts/projects/sync/',title:'uv project locking syncing --locked --frozen official documentation'});
  if(/\bwsl\b/i.test(q)&&/gpu|cuda|nvidia|顯示卡/i.test(q)) {
    pages.push({url:'https://docs.nvidia.com/cuda/wsl-user-guide/index.html',title:'CUDA on WSL User Guide — NVIDIA GPU Windows WSL'});
    if(/docker|容器/i.test(q)) pages.push({url:'https://docs.docker.com/desktop/features/gpu/',title:'GPU support in Docker Desktop for Windows WSL NVIDIA'});
  }
  if(/godot/i.test(q)&&/android/i.test(q)&&/C#|\.net/i.test(q)) {
    const v=q.match(/\b(4\.(\d+))\b/), branch=v?.[1]||'stable';
    pages.push({url:`https://docs.godotengine.org/en/${branch}/tutorials/export/exporting_for_android.html`,title:`Godot ${branch} C# Android export documentation`});
    if(v&&Number(v[2])>0) pages.push({url:`https://docs.godotengine.org/en/${branch}/tutorials/migrating/upgrading_to_godot_4.${v[2]}.html`,title:`Godot ${branch} C# Android migration requirements`});
  }
  if(/cloudflare/i.test(q)&&/workers\s*ai/i.test(q)&&/pric|費用|免費|額度/i.test(q)) pages.push({url:'https://developers.cloudflare.com/workers-ai/platform/pricing/',title:'Cloudflare Workers AI pricing free Neurons'});
  return pages.map(p=>({...p,content:'',reference_entry:true,score:0,query_variant:q}));
}
