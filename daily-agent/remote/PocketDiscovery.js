import Bonjour from 'bonjour-service';
import os from 'node:os';
import {isIP} from 'node:net';

export function pocketEndpoint(value){
  const u=new URL(value),parts=u.hostname.split('.').map(Number);
  const privateIP=isIP(u.hostname)===4&&(parts[0]===10||(parts[0]===172&&parts[1]>=16&&parts[1]<=31)||(parts[0]===192&&parts[1]===168));
  if(u.protocol!=='https:'||!privateIP||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('PocketDrop 只接受私人區域網路 IPv4 的 HTTPS 端點。');
  return u.origin;
}
export function pocketCandidates(service,deviceId){
  if(service?.txt?.app!=='PocketDrop'||String(service.txt.pv)!=='1'||service.txt.id!==deviceId||!Number.isInteger(service.port)||service.port<1||service.port>65535)return [];
  return [...new Set((service.addresses||[]).flatMap(ip=>{try{return [pocketEndpoint(`https://${ip}:${service.port}`)];}catch{return [];}}))].slice(0,8);
}
// Discovery is just an untrusted list of locations. It never changes a pin or sends credentials.
export function discoverPocketDrop(deviceId,{timeoutMs=3500,createBonjour=options=>new Bonjour(options,()=>{}),interfaces=os.networkInterfaces()}={}){
  const addresses=[...new Set(Object.values(interfaces).flat().filter(i=>i?.family==='IPv4'&&!i.internal).map(i=>i.address))].filter(ip=>{try{pocketEndpoint('https://'+ip);return true;}catch{return false;}}).slice(0,8);
  if(!addresses.length)return Promise.resolve([]);
  return new Promise(resolve=>{
    const sessions=[],endpoints=new Set();let ended=false;
    const collect=service=>{if(ended)return;for(const endpoint of pocketCandidates(service,deviceId)){if(endpoints.size<16)endpoints.add(endpoint);}};
    const finish=()=>{if(ended)return;ended=true;clearTimeout(timer);for(const {browser,bonjour} of sessions){try{browser?.stop();}catch{}try{bonjour.destroy();}catch{}}resolve([...endpoints]);};
    const timer=setTimeout(finish,Math.max(50,Math.min(5000,timeoutMs)));
    for(const ip of addresses){
      try{
        const bonjour=createBonjour({type:'udp4',interface:ip,bind:'0.0.0.0',reuseAddr:true});
        const session={bonjour,browser:null};sessions.push(session);
        session.browser=bonjour.find({type:'pocketdrop',protocol:'tcp'},collect);
        session.browser.on('srv-update',collect);session.browser.on('txt-update',collect);
      }catch{}
    }
    if(!sessions.length)finish();
  });
}
