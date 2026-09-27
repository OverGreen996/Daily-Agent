import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const dir=path.resolve('../.daily-runtime/tokenizer');await fs.mkdir(dir,{recursive:true});
const model='Qwen/Qwen3.5-4B';
const info=await(await fetch('https://huggingface.co/api/models/'+model,{signal:AbortSignal.timeout(30000)})).json();
if(!/^[a-f0-9]{40}$/.test(info.sha))throw Error('Invalid tokenizer revision');
const files={};
for(const name of ['tokenizer.json','tokenizer_config.json']){
  const r=await fetch(`https://huggingface.co/${model}/resolve/${info.sha}/${name}`,{signal:AbortSignal.timeout(120000)});
  if(!r.ok)throw Error('Tokenizer download '+r.status);
  const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>40_000_000)throw Error('Unexpected tokenizer size');
  JSON.parse(bytes.toString());await fs.writeFile(path.join(dir,name),bytes);files[name]=createHash('sha256').update(bytes).digest('hex');
}
await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({model,revision:info.sha,files},null,2));console.log('Tokenizer installed: '+info.sha);
