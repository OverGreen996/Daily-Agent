import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Tokenizer} from '@huggingface/tokenizers';
export function loadNativeTokenizer(dir){
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  const files={};
  for(const name of ['tokenizer.json','tokenizer_config.json']){
    const bytes=fs.readFileSync(path.join(dir,name));
    if(createHash('sha256').update(bytes).digest('hex')!==manifest.files[name])throw Error('Tokenizer checksum mismatch');
    files[name]=JSON.parse(bytes);
  }
  const tokenizer=new Tokenizer(files['tokenizer.json'],files['tokenizer_config.json']);
  const cache=new Map();
  return {model:manifest.model,revision:manifest.revision,count(text){
    text=String(text);if(cache.has(text))return cache.get(text);
    const count=tokenizer.encode(text,{add_special_tokens:false}).ids.length;
    if(text.length<4000){if(cache.size>=512)cache.delete(cache.keys().next().value);cache.set(text,count);}
    return count;
  }};
}
