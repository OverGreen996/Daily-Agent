import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
// A release uses one pinned snapshot. Opting into a development core is explicit;
// never mix individual files from a partly present neighbouring checkout.
const directory=process.env.XNG_CORE_ROOT
 ?path.resolve(process.env.XNG_CORE_ROOT):path.resolve(here,'../xng-core');
export async function loadCore(file){
 if(!/^[A-Za-z]+\.js$/.test(file))throw Error('Invalid core module');
 if(!fs.existsSync(path.join(directory,'index.js'))||!fs.existsSync(path.join(directory,file)))
  throw Error('XNG core is incomplete: '+directory+'; restore the bundled snapshot or correct XNG_CORE_ROOT');
 return import(pathToFileURL(path.join(directory,file)));
}
