import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {XngCore} from './Core.js';
export function createHubServer({core=new XngCore(),upstream=core.endpoint,fetcher=fetch}={}){
 const server=http.createServer(async(req,res)=>{
  const send=(status,value)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...(status===429?{'retry-after':'2'}:{})});res.end(JSON.stringify(value));}};
  try{
   const port=server.address()?.port,hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
   if(!hosts.includes(req.headers.host))return send(403,{error:'Host rejected'});
   const origin=req.headers.origin;
   if(origin&&!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin))return send(403,{error:'Origin rejected'});
   if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'Cross-site rejected'});
   if(origin){res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin');}
   if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Content-Type'});return res.end();}
   const url=new URL(req.url,`http://127.0.0.1:${port}`);
   if(['/health','/status'].includes(url.pathname)&&req.method==='GET')return send(200,core.status());
   if(req.method!=='GET'&&req.method!=='POST')return send(405,{error:'GET or POST required'});
   let body=Buffer.alloc(0);if(req.method==='POST'){
    for await(const chunk of req){if(body.length+chunk.length>8192)return send(413,{error:'Request body too large'});body=Buffer.concat([body,chunk]);}
   }
   if(url.pathname==='/search'){
    const remote=new URL('/search'+url.search,upstream),r=await fetcher(remote,{method:req.method,signal:AbortSignal.timeout(12000),...(req.method==='POST'?{headers:{'content-type':req.headers['content-type']||'application/x-www-form-urlencoded'},body}:{})});
    const headers=Object.fromEntries([...r.headers].filter(([k])=>!['connection','transfer-encoding','content-encoding','content-length','set-cookie'].includes(k)));
    const cookies=r.headers.getSetCookie?.();if(cookies?.length)headers['set-cookie']=cookies;
    res.writeHead(r.status,headers);if(r.body)await pipeline(Readable.fromWeb(r.body),res);else res.end(await r.text());return;
   }
   if(!['/ai/search','/debug/search'].includes(url.pathname))return send(404,{error:'Endpoint not found'});
   const params=req.method==='POST'?(req.headers['content-type']?.includes('application/json')?JSON.parse(body.toString('utf8')):Object.fromEntries(new URLSearchParams(body.toString('utf8')))):Object.fromEntries(url.searchParams);
   const result=await core.search(params.q??params.query,{mode:params.mode||'normal',limit:params.limit,sourceLimit:params.source_limit,debug:url.pathname==='/debug/search'});
   return send(200,result);
  }catch(e){if(res.headersSent){res.destroy();return;}send(e.status|| (e instanceof SyntaxError?400:502),{error:e.status?e.message:'搜尋服務暫時不可用',paid:false});}
 });
 server.requestTimeout=60000;server.headersTimeout=10000;server.keepAliveTimeout=5000;return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const core=new XngCore({endpoint:process.env.XNG_SEARXNG_URL||'http://127.0.0.1:8888',...(process.env.XNG_STATE_DIR?{stateDir:process.env.XNG_STATE_DIR}:{})});
 const server=createHubServer({core}),port=Number(process.env.XNG_PORT||8889);
 server.listen(port,'127.0.0.1',()=>console.log(`XNG AI Search Hub http://127.0.0.1:${port} — NT$0, no LLM`));
 const close=async()=>{server.close();server.closeIdleConnections();await core.close();};process.once('SIGINT',close);process.once('SIGTERM',close);
}
