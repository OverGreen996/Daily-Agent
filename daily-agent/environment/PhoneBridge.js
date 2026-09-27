import https from 'node:https';
import os from 'node:os';
import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
const equal=(a,b)=>typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function phoneCertificate(addresses){const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./phone-certificate.ps1',import.meta.url)),'-Addresses',addresses.join(',')],{windowsHide:true,timeout:15000,maxBuffer:64000});return {pfx:Buffer.from(stdout.trim(),'base64')};}
export class PhoneBridge{
  constructor(location,{port=3211,host='0.0.0.0',certificate=phoneCertificate,now=Date.now,onLocation=()=>{}}={}){Object.assign(this,{location,port,host,certificate,now,onLocation});}
  async start(){
    await this.close();
    this.addresses=[...new Set(['127.0.0.1',...Object.values(os.networkInterfaces()).flat().filter(x=>x.family==='IPv4'&&!x.internal).map(x=>x.address)])];
    const tls=await this.certificate(this.addresses);this.code=String(randomInt(100000,1000000));this.expires=this.now()+300000;this.attempts=0;this.token=null;
    this.server=https.createServer(tls,(req,res)=>this.handle(req,res));this.server.requestTimeout=10000;this.server.headersTimeout=10000;
    await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(this.port,this.host,resolve);});
    this.actualPort=this.server.address().port;
    this.timer=setTimeout(()=>{if(!this.token)this.close();},300000);this.timer.unref();
    return {urls:this.addresses.filter(x=>x!=='127.0.0.1').map(x=>`https://${x}:${this.actualPort}`),code:this.code,expires_at:new Date(this.expires).toISOString()};
  }
  async handle(req,res){
    const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    try{
      const hosts=this.addresses.map(a=>`${a}:${this.actualPort}`);
      if(!hosts.includes(req.headers.host)|| (req.headers.origin && req.headers.origin!==`https://${req.headers.host}`)||req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'來源不符。'});
      if(req.method==='GET' && ['/','/phone.js'].includes(req.url)){
        const name=req.url==='/'?'phone.html':'phone.js';
        const file=await fs.readFile(new URL('../ui/'+name,import.meta.url));
        res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'none'; frame-ancestors 'none'; connect-src 'self'",'Permissions-Policy':'geolocation=(self)','X-Content-Type-Options':'nosniff'});return res.end(file);
      }
      if(req.method!=='POST')return send(404,{error:'沒有此功能。'});
      let body='';for await(const part of req){body+=part;if(body.length>4096)return send(413,{error:'資料過大。'});}const data=JSON.parse(body||'{}');
      if(req.url==='/pair'){
        if(this.token || this.now()>this.expires || this.attempts++>=5 || !equal(data.code,this.code))return send(403,{error:'配對碼錯誤或已到期，請在桌寵重新開啟配對。'});
        this.code=null;this.token=randomBytes(32).toString('hex');this.pairedAt=this.now();return send(200,{token:this.token});
      }
      if(!this.token||!equal(req.headers.authorization,'Bearer '+this.token))return send(401,{error:'請重新配對。'});
      if(req.url==='/location'){
        if(this.lastFix && this.now()-this.lastFix<10000)return send(429,{error:'更新太頻繁。'});
        const wasPc=this.location.activeDevice!=='android';this.location.updateAndroid({latitude:data.latitude,longitude:data.longitude,accuracy:data.accuracy});this.location.setActiveDevice('android');this.lastFix=this.now();
        const key=Math.round(data.latitude*10)+':'+Math.round(data.longitude*10);if(wasPc||key!==this.locationKey){this.locationKey=key;this.onLocation();}return send(200,{received:true});
      }
      if(req.url==='/revoke'){send(200,{revoked:true});await this.close();return;}
      send(404,{error:'沒有此功能。'});
    }catch{if(!res.headersSent)send(400,{error:'資料格式錯誤。'});}
  }
  status(){return {listening:!!this.server,paired:!!this.token,lastFix:this.lastFix||null};}
  async close(){clearTimeout(this.timer);const server=this.server;this.server=null;this.token=null;this.code=null;this.lastFix=null;this.locationKey=null;const hadPhone=!!this.location.phone;this.location.phone=null;this.location.setActiveDevice('pc');if(hadPhone)this.onLocation();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
