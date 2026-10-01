// One-line, source-guarded import repair. No database or runtime data is touched.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const path='server/routers.ts';
const source=fs.readFileSync(path,'utf8');
const before='  setGlobalOrderProgressSequence,\n';
const after='  listOrderStatusTypes, setGlobalOrderProgressSequence,\n';
if(source.includes(after)) { console.log('Progress reader import already present.'); }
else {
  if(createHash('sha256').update(source).digest('hex')!=='1d29a52d8dae9dd48144474e4eef26b5ae4c1d391a9aae4fa0cb1a7a8cfe8981') throw new Error('Source changed since review; nothing written.');
  if(source.split(before).length!==2) throw new Error('Expected unique named import.');
  fs.writeFileSync(path,source.replace(before,after));
  console.log('Imported listOrderStatusTypes for both global progress handlers.');
}
