import {safeUrl,assertReadablePage} from './BrowserAgent.js';
import {relevantPassages} from './Passages.js';
import {steamLinks} from './SteamStore.js';

function decode(s){
  return String(s||'')
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
    .replace(/&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
}
function meta(html,name){
  const a=new RegExp('<meta[^>]+(?:name|property)=["\\\']'+name+'["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\']','i').exec(html);
  const b=new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+(?:name|property)=["\\\']'+name+'["\\\']','i').exec(html);
  return decode((a||b)?.[1]||'');
}
function contentRoot(html){
  // Preserve nested markup while choosing the article/main/wiki content region.
  const start=/<article\b[^>]*>|<main\b[^>]*>|<div\b[^>]*\bid=["'](?:mw-content-text|mw-parser-output)["'][^>]*>/i.exec(html);
  if(!start)return html;
  const tag=/^<(\w+)/.exec(start[0])[1], re=new RegExp('<\\/?'+tag+'\\b[^>]*>','gi');
  re.lastIndex=start.index+start[0].length;let depth=1,m;
  while((m=re.exec(html))){depth+=m[0].startsWith('</')?-1:1;if(!depth)return html.slice(start.index,re.lastIndex);}
  return html;
}
function pageDates(html){
  let date=meta(html,'article:published_time')||meta(html,'datePublished')||meta(html,'date')||null;
  let modified=meta(html,'article:modified_time')||meta(html,'dateModified')||meta(html,'updated_at')||null;
  modified ||= meta(html,'dcterms.modified')||meta(html,'dc.modified')||null;
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const walk=n=>{if(!n||typeof n!=='object')return;const type=String(n['@type']||'');
        if(/Article|BlogPosting|WebPage/i.test(type)){date ||= n.datePublished||null;modified ||= n.dateModified||null;}
        for(const x of Object.values(n))if(x&&typeof x==='object')walk(x);
      };walk(JSON.parse(decode(m[1]).trim()));
    }catch{}
  }
  if(!modified){
    const edited=html.match(/This page was last edited on\s+(\d{1,2}\s+[A-Za-z]+\s+20\d{2}),?\s+(?:at\s+)?(\d{1,2}:\d{2})(?:\s*\(?(UTC)\)?)?/i);
    if(edited)modified=edited[1]+' '+edited[2]+' UTC';
  }
  return {date:Number.isFinite(Date.parse(date))?date:null,modified_at:Number.isFinite(Date.parse(modified))?modified:null};
}
function extractProducts(html){
  const out=[],seen=new Set();
  const add=(name,price,currency='',availability=null)=>{
    name=decode(name).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    const n=Number(String(price??'').replace(/,/g,''));
    if(!name||!Number.isFinite(n)||n<=0)return;
    const key=name+'|'+n+'|'+currency;if(seen.has(key))return;seen.add(key);
    out.push({name,price:n,currency:String(currency||''),availability});
  };
  const walk=node=>{
    if(Array.isArray(node)){for(const x of node)walk(x);return;}
    if(!node||typeof node!=='object')return;
    const type=Array.isArray(node['@type'])?node['@type'].join(' '):String(node['@type']||'');
    if(/Product/i.test(type)){
      const offers=Array.isArray(node.offers)?node.offers:[node.offers].filter(Boolean);
      for(const offer of offers){
        if(!offer||typeof offer!=='object')continue;
        const price=offer.price??offer.lowPrice??offer.highPrice;
        add(node.name||node.headline||'',price,offer.priceCurrency||node.priceCurrency||'',offer.availability||null);
      }
    }
    for(const v of Object.values(node))if(v&&typeof v==='object')walk(v);
  };
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{walk(JSON.parse(decode(m[1]).trim()));}catch{}
  }
  return out.slice(0,80);
}
function extractHtml(html,url,query=''){
  const title=decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)||[])[1]||'').replace(/\s+/g,' ').trim();
  const dates=pageDates(html);
  const description=meta(html,'description')||meta(html,'og:description')||'';
  let body=contentRoot(html)
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<(script|style|svg|nav|footer|header|aside|form|iframe|noscript)[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi,'\n')
    .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g,' ');
  body=decode(body).replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
  const body_truncated=body.length>18000;
  const canonicalTag=[...html.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]).find(t=>/\brel\s*=\s*["']canonical["']/i.test(t));
  let canonical_url=null;try{const value=canonicalTag?.match(/\bhref\s*=\s*["']([^"']+)/i)?.[1];if(value){const u=new URL(decode(value),url);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)canonical_url=u.href;}}catch{}
  const products=extractProducts(html);
  const steam_links=steamLinks(contentRoot(html));
  if(products.length){
    const structured=products.map(p=>`商品: ${p.name} | 價格: ${p.currency} ${p.price}`).join('\n');
    body=structured+'\n'+(query?relevantPassages(body,query,Math.max(1000,18000-structured.length)):body);
    body=body.slice(0,18000);
  } else body=query?relevantPassages(body,query,18000):body.slice(0,18000);
  return {title,source:new URL(url).hostname,url,...dates,body,description,products,canonical_url,body_truncated,...(steam_links.length?{steam_links}:{}),coverage:'page',retrieved_at:new Date().toISOString(),reader:'http-fast'};
}

export class FastPageReader{
  constructor({fetcher=fetch,timeout=5500,maxBytes=2500000}={}){Object.assign(this,{fetcher,timeout,maxBytes});}
  async open(url,{signal,timeout=this.timeout,query=''}={}){
    let current=await safeUrl(url);
    timeout=Math.max(1000,Math.min(this.timeout,Number(timeout)||this.timeout));
    const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);
    for(let hop=0;hop<4;hop++){
      requestSignal.throwIfAborted();
      const response=await this.fetcher(current,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 Daily-Agent-Reader/0.2'},signal:requestSignal});
      if(response.status>=300&&response.status<400){
        const loc=response.headers.get('location'); if(!loc)throw Error('HTTP redirect without location');
        current=await safeUrl(new URL(loc,current).href); continue;
      }
      if(!response.ok)throw Error('HTTP '+response.status);
      const type=(response.headers.get('content-type')||'').toLowerCase();
      if(!/text\/html|text\/plain|application\/xhtml\+xml/.test(type))throw Error('not readable text');
      const len=Number(response.headers.get('content-length')||0); if(len>this.maxBytes)throw Error('page too large');
      let text;
      if(response.body?.getReader){
        const reader=response.body.getReader(),chunks=[];let bytes=0;
        try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>this.maxBytes)throw Error('page too large');chunks.push(value);}text=new TextDecoder().decode(Buffer.concat(chunks));}
        catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
      }else {text=await response.text();if(Buffer.byteLength(text)>this.maxBytes)throw Error('page too large');}
      const page=type.includes('text/plain')?{title:'',source:new URL(current).hostname,url:current,date:null,body:query?relevantPassages(text,query,18000):text.slice(0,18000),body_truncated:text.length>18000,description:'',coverage:'page',retrieved_at:new Date().toISOString(),reader:'http-fast'}:extractHtml(text,current,query);
      if(page.body.length<220)throw Error('page too short for fast reader');
      return assertReadablePage(page,response.status);
    }
    throw Error('too many redirects');
  }
}
