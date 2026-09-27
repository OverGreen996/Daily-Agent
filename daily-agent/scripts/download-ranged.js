import fs from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const [url,destination,totalText,workersText='6']=process.argv.slice(2);
const total=Number(totalText),workers=Math.max(1,Math.min(12,Number(workersText)||6));
if(!url||!destination||!Number.isSafeInteger(total)||total<1)throw Error('usage: node download-ranged.js URL FILE TOTAL [WORKERS]');
const start=fs.existsSync(destination)?fs.statSync(destination).size:0;
if(start>total)throw Error('partial file is larger than expected');
if(start===total){console.log('already complete');process.exit(0);}
const remaining=total-start,unit=Math.ceil(remaining/workers);
const jobs=[];
for(let i=0;i<workers;i++){
  const from=start+i*unit,to=Math.min(total-1,from+unit-1);
  if(from>to)continue;
  jobs.push((async()=>{
    const part=`${destination}.range-${String(i).padStart(2,'0')}`;
    if(!fs.existsSync(part))fs.closeSync(fs.openSync(part,'a'));
    const expected=to-from+1,actual=fs.statSync(part).size;
    if(actual>expected)throw Error(`range ${i} partial is larger than expected`);
    for(let attempt=1;fs.statSync(part).size<expected;attempt++){
      if(attempt>12)throw Error(`range ${i} failed after 12 attempts`);
      const have=fs.statSync(part).size,rangeFrom=from+have;
      try{
        const response=await fetch(url,{headers:{Range:`bytes=${rangeFrom}-${to}`},redirect:'follow'});
        if(response.status!==206)throw Error(`HTTP ${response.status}`);
        const range=response.headers.get('content-range')||'';
        if(!range.startsWith(`bytes ${rangeFrom}-${to}/`))throw Error(`mismatch: ${range}`);
        await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(part,{flags:'a'}));
      }catch(error){
        console.error(`range ${i+1}/${workers} retry ${attempt}: ${error.message}`);
        await new Promise(resolve=>setTimeout(resolve,Math.min(10000,attempt*1000)));
      }
    }
    const actualAfter=fs.statSync(part).size;
    if(actualAfter!==expected)throw Error(`range ${i} size ${actualAfter}, expected ${expected}`);
    console.log(`range ${i+1}/${workers} complete`);
    return part;
  })());
}
const parts=await Promise.all(jobs);
for(const part of parts){await pipeline(fs.createReadStream(part),fs.createWriteStream(destination,{flags:'a'}));fs.unlinkSync(part);}
if(fs.statSync(destination).size!==total)throw Error('assembled file size mismatch');
console.log(`complete: ${total} bytes`);
