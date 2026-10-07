// Public HTML reader: no browser/model/runtime, no credentials, pinned public DNS.
import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

export function publicAddress(ip) {
  if (net.isIP(ip)===4) {
    const [a,b]=ip.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||a===100&&b>=64&&b<=127||a===198&&[18,19,51].includes(b)||a===203&&b===0);
  }
  // Global unicast only, including rejection of mapped IPv4 and documentation space.
  return net.isIP(ip)===6&&/^[23]/.test(ip)&&!/^2001:(?:db8|0:|10:|2:)/i.test(ip);
}
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,v=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[v]).replace(/&#(x[\da-f]+|\d+);/gi,(v,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):v;});
export function pageText(html) {
  const title=decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]||'').trim();
  const main=/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i.exec(html)?.[1]||html;
  const body=decode(main.replace(/<(script|style|nav|footer|header|form|noscript|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim().slice(0,14000);
  if(body.length<100||/^(just a moment|access denied|attention required|robot check)/i.test(title)||body.length<2000&&/verify.{0,20}human|unusual traffic|人機驗證/i.test(body))throw Error('page_unreadable');
  return {title,body,coverage:'page',retrieved_at:new Date().toISOString()};
}
export class EvidenceReader {
  constructor({lookup=dns.lookup,request,now=Date.now}={}) {Object.assign(this,{lookup,request,now});}
  async read(value,{signal,timeoutMs=4000,redirects=0,deadline=this.now()+timeoutMs}={}) {
    signal?.throwIfAborted();
    const url=new URL(value),host=url.hostname.replace(/^\[|\]$/g,'');
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!['','80','443'].includes(url.port))throw Error('public_url_required');
    const addresses=net.isIP(host)?[{address:host,family:net.isIP(host)}]:await Promise.race([this.lookup(host,{all:true}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('dns_timeout')),Math.max(1,deadline-this.now()));timer.unref();})]);
    if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('private_address');
    const wait=Math.min(timeoutMs,deadline-this.now());if(wait<=0)throw Error('page_timeout');
    const result=await new Promise((resolve,reject)=>{
      const req=(this.request|| (url.protocol==='https:'?https.request:http.request))(url,{method:'GET',signal,
        headers:{'User-Agent':'Endfield-Assistant/1.0 (public-source-reader)','Accept':'text/html,text/plain','Accept-Encoding':'identity'},
        lookup:(_host,options,done)=>{const a=addresses[0];done(null,options.all?addresses:a.address,options.all?undefined:a.family);}},res=>{
        if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}
        if(res.statusCode!==200||!/^text\/(?:html|plain)(?:;|$)/i.test(res.headers['content-type']||'')||!['','identity'].includes(res.headers['content-encoding']||'')){res.resume();reject(Error('page_unreadable'));return;}
        let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>1500000){req.destroy(Error('page_too_large'));return;}chunks.push(chunk);});
        res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
      });
      const timer=setTimeout(()=>req.destroy(Error('page_timeout')),wait);
      req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
    });
    if(result.redirect){if(redirects>=2)throw Error('redirect_limit');return this.read(new URL(result.redirect,url).href,{signal,timeoutMs,deadline,redirects:redirects+1});}
    return {...pageText(result.html),url:url.href,source:host};
  }
}
