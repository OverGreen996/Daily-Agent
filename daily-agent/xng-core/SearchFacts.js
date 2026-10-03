import {hostOf,isDirectRetailUrl} from './SearchQuality.js';
import {publisherKey} from './SourceRegistry.js';
import {isGameQuery} from './GameSearch.js';
import {observedGameVersions} from './GameVersionCheck.js';

const MONEY=/(?:(?:NT\$|TWD\s*|新台幣\s*|台幣\s*|NTD\s*)\$?\s*([0-9][0-9,]{2,})|\$\s*([0-9][0-9,]{2,})|([0-9][0-9,]{2,})\s*元)/gi;
const VERSION=/\b(?:v(?:ersion)?\s*)?((?:20\d{2}\.)?\d+(?:\.\d+){1,3})\b/gi;
const DATE=/\b(20\d{2})[-\/.](0?[1-9]|1[0-2])[-\/.](0?[1-9]|[12]\d|3[01])\b/g;

function uniq(arr){ return [...new Set(arr)]; }
function textOf(r){ return ((r.title||'')+' '+(r.body||'')).slice(0,24000); }
function normMoney(s){ const n=Number(String(s).replace(/,/g,'')); return Number.isFinite(n)?n:null; }
function normalizedSku(s){return String(s).toLowerCase().replace(/\b(\d+)\s*g(?:b)?\b/gi,'$1gb').replace(/\s+/g,'');}
function phoneSku(s){return String(s).match(/iphone\s*(\d{1,2})\s*(pro\s*max|pro|plus|air|mini)?/i);}
function priceAnchors(query){
 const phone=phoneSku(query);
 if(phone)return ['iphone',phone[1],...(phone[2]?[phone[2].toLowerCase().replace(/\s+/g,'')]:[]),...(String(query).match(/\b\d+\s*g(?:b)?\b/i)?[normalizedSku(String(query).match(/\b\d+\s*g(?:b)?\b/i)[0])]:[])];
 return [...new Set((String(query).match(/\b\d+(?:\.\d+)+\b|\b\d{3,}\b|\b[A-Za-z]+\d+[A-Za-z0-9-]*\b/g)||[]).map(s=>s.toLowerCase()))];
}
function matchesSku(text,anchors){
 const low=normalizedSku(text);
 if(!anchors.every(a=>low.includes(normalizedSku(a))))return false;
 if(anchors[0]==='iphone'){
  const sku=phoneSku(text),variant=anchors.find(a=>/^(?:promax|pro|plus|air|mini)$/.test(a))||'';
  if(!sku||sku[1]!==anchors[1]||(sku[2]||'').toLowerCase().replace(/\s+/g,'')!==variant)return false;
  for(const found of String(text).matchAll(/iphone\s*(\d{1,2})\s*(pro\s*max|pro|plus|air|mini)?/gi))if(found[1]!==anchors[1]||(found[2]||'').toLowerCase().replace(/\s+/g,'')!==variant)return false;
  if(/手機殼|保護殼|保護貼|case\b|screen protector|充電線|充電器/i.test(text))return false;
 }
 return true;
}
function valuesByDomain(results, extractor){
  const by=new Map();
  for(const r of results||[]){
    const host=publisherKey(r.url)||String(r.source||'unknown');
    const vals=uniq(extractor(textOf(r),r));
    for(const v of vals){
      if(!by.has(v))by.set(v,{domains:new Set(),primary:new Set()});
      const bucket=by.get(v); bucket.domains.add(host);
      if(r.reliability==="primary")bucket.primary.add(host);
    }
  }
  return [...by.entries()].map(([value,b])=>({
    value,support:b.domains.size,primary_support:b.primary.size,
    domains:[...b.domains],primary_domains:[...b.primary]
  })).sort((a,b)=>b.primary_support-a.primary_support||b.support-a.support);
}

function priceValues(text,anchors=[]){
  const source=String(text||""),out=[];
  const targets=anchors.map(a=>String(a).toLowerCase()).filter(Boolean);
  const targetNums=targets.filter(a=>/^\d{3,5}$/.test(a));
  const matchTarget=s=>{
    return !targets.length||matchesSku(s,targets);
  };
  const money=s=>{
    const vals=[];
    for(const m of String(s||"").matchAll(MONEY)){
      const n=normMoney(m[1]||m[2]||m[3]);
      if(n>=100&&n<=10000000)vals.push(n);
    }
    return vals;
  };
  const noisy=s=>/組合包|整機|筆電|notebook|laptop|外接顯示卡|ai\s*box/i.test(String(s||""));
  const conflictingSku=s=>targetNums.some(target=>{
    const found=[];
    const re=/(?:rtx|gtx|rx|arc|geforce|radeon)\s*-?\s*(\d{3,5})(?:\s*\/\s*(\d{3,5}))?/gi;
    for(const m of String(s||"").matchAll(re)){
      if(m[1])found.push(m[1]);
      if(m[2])found.push(m[2]);
    }
    return found.some(n=>n!==target);
  });
  const lines=source.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(!matchTarget(line)||noisy(line))continue;
    const nums=[...line.matchAll(/\b\d{3,5}\b/g)].map(m=>m[0]);
    const ambiguous=targetNums.length&&nums.some(n=>!targetNums.includes(n));
    if(!ambiguous){
      const vals=money(line); if(vals.length){out.push(...vals);continue;}
    } else {
      const before=out.length;
      for(const part of line.split(/[，。；;|]/)){
        if(matchTarget(part)&&!noisy(part)&&!conflictingSku(part))out.push(...money(part));
      }
      if(out.length>before)continue;
    }
    if(conflictingSku(line))continue;
    for(let j=i+1;j<Math.min(lines.length,i+4);j++){
      if(conflictingSku(lines[j]))break;
      const vals=money(lines[j]); if(vals.length){out.push(...vals);break;}
    }
  }
  if(!lines.length&&matchTarget(source))out.push(...money(source));
  return uniq(out);
}
function structuredPriceProducts(result,anchors=[]){
  const targetNums=anchors.filter(a=>/^\d{3,5}$/.test(String(a)));
  const wrongType=/組合包|電腦主機|電競主機|桌上型電腦|筆電|notebook|laptop|外接(?:式)?顯示卡|ai\s*box/i;
  const restricted=/限整機|需搭|搭(?:配)?.{0,12}主機板|綁購|bundle/i;
  const matches=[];
  for(const p of result?.products||[]){
    const name=String(p.name||""),low=name.toLowerCase();
    if(anchors.length&&!matchesSku(name,anchors))continue;
    const models=[];
    const re=/(?:rtx|gtx|rx|arc|geforce|radeon)\s*-?\s*(\d{3,5})(?:\s*\/\s*(\d{3,5}))?/gi;
    for(const m of name.matchAll(re)){if(m[1])models.push(m[1]);if(m[2])models.push(m[2]);}
    if(targetNums.length&&models.some(n=>!targetNums.includes(n)))continue;
    if(wrongType.test(name))continue;
    if(p.currency&&!/^(?:TWD|NTD|NT\$)$/i.test(p.currency))continue;
    const price=Number(p.price);
    if(!Number.isFinite(price)||price<100||price>10000000)continue;
    matches.push({name,price,restricted:restricted.test(name),sold_out:/OutOfStock|SoldOut|Discontinued/i.test(p.availability||'')});
  }
  return matches;
}
function priceValuesForResult(text,result,anchors=[]){
  const structured=structuredPriceProducts(result,anchors).map(p=>p.price);
  return structured.length?uniq(structured):priceValues(text,anchors);
}
function versionValues(text,anchors=[]){
  const source=String(text||"");
  let chunks=[source];
  if(anchors.length){
    chunks=[]; const low=source.toLowerCase();
    for(const anchor of anchors){
      let pos=0;
      while((pos=low.indexOf(anchor,pos))>=0){
        chunks.push(source.slice(Math.max(0,pos-140),Math.min(source.length,pos+anchor.length+180)));
        pos+=anchor.length; if(chunks.length>=16)break;
      }
      if(chunks.length>=16)break;
    }
    if(!chunks.length)return [];
  }
  const out=[];
  for(const chunk of chunks)for(const m of chunk.matchAll(VERSION)){
    const v=m[1]; if(/^20\d{2}$/.test(v))continue; if(v.length<=20)out.push(v);
  }
  return out;
}
function productVersions(text,product){
  if(!product)return [];
  const escaped=product.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp('\\b'+escaped+'(?:\\s+(?:version|版本|v|release|desktop|for Windows|for Mac))*\\s*[:：-]?\\s*((?:20\\d{2}\\.)?\\d+(?:\\.\\d+){1,3})(?![\\d.])','gi');
  return [...String(text).matchAll(re)].map(m=>m[1]);
}
function stalePrice(result,now){
  const text=textOf(result), editorial=/上市|首賣|發表|launch|announc/i.test(result.title||'')||/\/(?:news|article|blog)\//i.test(result.url||'');
  if(!editorial)return false;
  const bodyDate=text.match(/(?:@|發布[日期時間：\s]*)(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/);
  const stamp=Date.parse(result.modified_at||result.date|| (bodyDate?`${bodyDate[1]}-${bodyDate[2].padStart(2,'0')}-${bodyDate[3].padStart(2,'0')}`:''));
  return Number.isFinite(stamp)&&now-stamp>90*86400000;
}
function compareVersionsDesc(a,b){
  const pa=String(a).split('.').map(Number),pb=String(b).split('.').map(Number),n=Math.max(pa.length,pb.length);
  for(let i=0;i<n;i++){const av=pa[i]||0,bv=pb[i]||0;if(av!==bv)return bv-av;}
  return 0;
}
function dateValues(text){
  const out=[]; for(const m of text.matchAll(DATE)){out.push(m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0'));} return out;
}

export function gateQualityWithFacts(quality,facts){
  const out={...(quality||{})},gates=[];
  if(facts?.price?.verified===false){gates.push("price-unverified");if(out.confidence==="HIGH")out.confidence="MEDIUM";}
  if(facts?.price?.verified===true&&facts.price.standalone_verified===false){gates.push("price-restricted");if(out.confidence==="HIGH")out.confidence="MEDIUM";}
  if(facts?.version?.verified===false){gates.push("version-unverified");if(out.confidence==="HIGH")out.confidence="MEDIUM";}
  if(facts?.price?.standalone_domains?.length<2){gates.push('price-single-merchant');if(out.confidence==='HIGH')out.confidence='MEDIUM';}
  if(facts?.version?.conflict){gates.push('version-conflict');if(out.confidence==='HIGH')out.confidence='MEDIUM';}
  if(facts?.price?.conflict){gates.push('price-conflict');if(out.confidence==='HIGH')out.confidence='MEDIUM';}
  if(gates.length)out.fact_gates=gates;
  return out;
}

export function crossCheckFacts(query,results,{now=Date.now()}={}){
  const q=String(query||''); const facts={};
  if(/價格|售價|價錢|多少錢|比價|price|buy/i.test(q)){
    const anchors=priceAnchors(q);
    const retailResults=(results||[]).filter(r=>isDirectRetailUrl(r.url));
    const observedResults=retailResults.length?retailResults:(results||[]);
    const staleSources=observedResults.filter(r=>stalePrice(r,Number(now)));
    const sourceResults=observedResults.filter(r=>!staleSources.includes(r));
    const values=valuesByDomain(sourceResults,(text,r)=>priceValuesForResult(text,r,anchors));
    if(values.length){
      let numeric=values.map(x=>Number(x.value)).filter(Number.isFinite).sort((a,b)=>a-b);
      const consensus=values.find(x=>x.support>=2)?.value??null;
      const retailerDomains=new Set(values.flatMap(x=>x.domains));
      const verifiedRange=retailResults.length>0&&retailerDomains.size>=2;
      const restriction=/限整機|需搭|搭(?:配)?.{0,12}主機板|組合包|綁購|bundle/i;
      const soldOut=/目前商品.{0,12}熱銷一空|本商品.{0,12}售罄|全數售罄|sold\s*out|out\s*of\s*stock/i;
      const priceRows=sourceResults.map(r=>{
        const structured=structuredPriceProducts(r,anchors);
        const prices=structured.length?structured.map(p=>p.price):priceValues(textOf(r),anchors);
        return {
          r, prices,
          restricted:structured.length?structured.every(p=>p.restricted):restriction.test(textOf(r)),
          sold_out:structured.length?structured.every(p=>p.sold_out):soldOut.test(textOf(r))
        };
      }).filter(x=>x.prices.length);
      const standaloneDomains=new Set(priceRows.filter(x=>!x.restricted&&!x.sold_out).map(x=>publisherKey(x.r.url)));
      const standalonePrices=priceRows.flatMap(x=>{
        const structured=structuredPriceProducts(x.r,anchors);
        return structured.length?structured.filter(p=>!p.restricted&&!p.sold_out).map(p=>p.price):!x.restricted&&!x.sold_out?x.prices:[];
      });
      if(standalonePrices.length)numeric=uniq(standalonePrices).sort((a,b)=>a-b);
      const median=numeric[Math.floor(numeric.length/2)];
      const restrictedSources=priceRows.filter(x=>x.restricted).map(x=>({source:hostOf(x.r.url),title:x.r.title||"",url:x.r.url}));
      const outOfStockSources=(retailResults||[]).filter(r=>soldOut.test(textOf(r))).map(r=>({source:hostOf(r.url),title:r.title||"",url:r.url}));
      const min=numeric[0],max=numeric.at(-1),spread=min>0?max/min:null;
      facts.price={
        verified:consensus!==null||verifiedRange,
        standalone_verified:standaloneDomains.size>0,
        mode:consensus!==null?"consensus":verifiedRange?(standaloneDomains.size?"market-range":"restricted-market-range"):"unverified",
        consensus,median,observed_min:min,observed_max:max,
        retailer_domains:[...retailerDomains],
        standalone_domains:[...standaloneDomains],
        restricted_sources:restrictedSources,
        out_of_stock_sources:outOfStockSources,
        stale_sources:staleSources.map(r=>({source:hostOf(r.url),title:r.title,url:r.url})),
        candidates:values.slice(0,10),
        wide_range:Number.isFinite(spread)&&spread>1.35,
        conflict:Number.isFinite(spread)&&spread>1.35
      };
    } else facts.price={verified:false,mode:"unverified",consensus:null,candidates:[],conflict:false,stale_sources:staleSources.map(r=>({title:r.title,url:r.url}))};
  }
  if(/版本|\brelease\b|\bversion\b|最新版/i.test(q)||(/latest|最新/i.test(q)&&!/setup|install|how\s*to|教學|安裝|設定/i.test(q))){
    const requested=versionValues(q);
    const anchors=[...new Set((q.toLowerCase().match(/[a-z][a-z0-9._-]{2,}/g)||[])
      .filter(w=>!["latest","official","version","release","notes","software","download","docs","documentation"].includes(w)))];
    const product=q.match(/\b(zbrush|godot|blender|python|node(?:\.js|js)|docker|wsl|windows|vlc|postgresql|pgbouncer)\b/i)?.[1];
    const values=valuesByDomain(results,text=>isGameQuery(q)?observedGameVersions(text):product?productVersions(text,product):versionValues(text,anchors))
      .sort((a,b)=>b.primary_support-a.primary_support||b.support-a.support||compareVersionsDesc(a.value,b.value));
    if(requested.length){
      const target=requested[0],hit=values.find(x=>x.value===target);
      facts.version={requested:target,verified:!!hit&&(hit.primary_support>=1||hit.support>=2),support:hit?.support||0,primary_support:hit?.primary_support||0,candidates:hit?[hit]:[],conflict:false};
    } else if(values.length) {
      const consensus=(values[0].support>=2||values[0].primary_support>=1)?values[0].value:null;
      facts.version={verified:consensus!==null,consensus,candidates:values.slice(0,10),conflict:values.length>1};
    } else facts.version={verified:false,consensus:null,candidates:[],conflict:false};
  }
  if(/日期|發布|新聞|今天|今日|date|released?/i.test(q)){
    const values=valuesByDomain(results,dateValues);
    if(values.length) facts.date={candidates:values.slice(0,10),conflict:values.length>1};
  }
  return facts;
}
