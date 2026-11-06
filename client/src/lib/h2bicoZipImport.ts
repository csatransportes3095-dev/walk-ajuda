/**
 * Leitura local do ZIP (sem upload do arquivo compactado).
 * Associamos foto e Nome/CPF apenas se houver chave inequívoca.
 */
import { decodeCpfText, isValidCpf } from "./h2bicoCpfExtractor";

export const H2BICO_ZIP_MAX_ARCHIVE_BYTES = 120 * 1024 * 1024;
export const H2BICO_ZIP_MAX_ENTRIES = 2500;
export const H2BICO_ZIP_MAX_TOTAL_BYTES = 300 * 1024 * 1024;
const MAX_PHOTO = 8 * 1024 * 1024;
const MAX_TEXT = 512 * 1024;
type Entry = { path:string; method:number; size:number; zipped:number; crc:number; offset:number };
type Person = { name:string; cpf:string; position:string|null; uf:string|null; stem:string; dir:string };
export type H2BicoZipIssue = { file:string; reason:string };
export type H2BicoZipResult = { files:File[]; photosFound:number; metadataFound:number; matched:number; issues:H2BicoZipIssue[] };
const basename = (path:string) => path.split("/").pop() || "";
const dirname = (path:string) => path.slice(0, Math.max(0,path.lastIndexOf("/")+1)).toLowerCase();
const stem = (path:string) => basename(path).replace(/\.[^.]+$/,"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const photoMime = (path:string):"image/jpeg"|"image/png"|"image/webp"|null =>
  /\.jpe?g$/i.test(path) ? "image/jpeg" : /\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : null;
const safeName = (name:string) => name.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g," ")
  .replace(/[_\s]+/g," ").trim().slice(0,120).toUpperCase() || "SEM NOME";
function crc32(input:Uint8Array):number {
  let v=0xffffffff;
  for(const b of input) {
    v^=b;
    for(let i=0;i<8;i++) v=(v>>>1)^((v&1)?0xedb88320:0);
  }
  return (v^0xffffffff)>>>0;
}
function entries(data:ArrayBuffer):Entry[] {
  const b=new Uint8Array(data),v=new DataView(data);
  if(b.byteLength<22||b.byteLength>H2BICO_ZIP_MAX_ARCHIVE_BYTES) throw Error("ZIP acima de 120 MB ou inválido.");
  let end=-1;
  for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--) {
    if(v.getUint32(i,true)===0x06054b50){end=i;break;}
  }
  if(end<0)throw Error("ZIP incompleto ou inválido.");
  if(v.getUint16(end+4,true)!==0||v.getUint16(end+6,true)!==0)throw Error("ZIP dividido não é aceito.");
  const count=v.getUint16(end+10,true);
  let cursor=v.getUint32(end+16,true);
  const centralSize=v.getUint32(end+12,true);
  if(count>H2BICO_ZIP_MAX_ENTRIES||count===65535||cursor===0xffffffff||
    centralSize===0xffffffff||cursor+centralSize>end)throw Error("ZIP muito grande ou ZIP64 não suportado.");
  const result:Entry[]=[];
  let total=0;
  for(let i=0;i<count;i++) {
    if(cursor+46>end||v.getUint32(cursor,true)!==0x02014b50)throw Error("Estrutura de ZIP inválida.");
    const flags=v.getUint16(cursor+8,true),method=v.getUint16(cursor+10,true);
    const crc=v.getUint32(cursor+16,true),zipped=v.getUint32(cursor+20,true);
    const size=v.getUint32(cursor+24,true);
    const length=v.getUint16(cursor+28,true),extra=v.getUint16(cursor+30,true),comment=v.getUint16(cursor+32,true);
    const offset=v.getUint32(cursor+42,true);
    if(cursor+46+length+extra+comment>end)throw Error("Entrada ZIP incompleta.");
    const raw=b.subarray(cursor+46,cursor+46+length);
    let name:string;
    try{name=new TextDecoder("utf-8",{fatal:true}).decode(raw);}
    catch{name=new TextDecoder("windows-1252").decode(raw);}
    cursor+=46+length+extra+comment;
    const path=name.replace(/\\/g,"/");
    if(!path||path.endsWith("/")||/(^|\/)(?:__MACOSX|\.DS_Store|Thumbs\.db)(?:\/|$)/i.test(path))continue;
    if(path.startsWith("/")||/(^|\/)\.\.(?:\/|$)/.test(path)||/^[a-z]:/i.test(path))
      throw Error("Caminho inseguro dentro do ZIP.");
    const image=photoMime(path),txt=/\.(?:txt|csv)$/i.test(path);
    if(!image&&!txt)continue;
    if(flags&1)throw Error("ZIP protegido por senha não é aceito.");
    if(method!==0&&method!==8)throw Error("Compressão ZIP não suportada.");
    if(size===0xffffffff||zipped===0xffffffff||offset===0xffffffff)throw Error("ZIP64 não suportado.");
    const limit=image?MAX_PHOTO:MAX_TEXT;
    if(size===0||size>limit) {result.push({path,method,size,zipped,crc,offset:-1});continue;}
    if(zipped===0||size/zipped>500)throw Error("ZIP com compactação suspeita.");
    total+=size;
    if(total>H2BICO_ZIP_MAX_TOTAL_BYTES)throw Error("ZIP descompactado excede 300 MB.");
    result.push({path,method,size,zipped,crc,offset});
  }
  return result;
}
async function expand(buffer:ArrayBuffer,item:Entry):Promise<Uint8Array>{
  if(item.offset<0)throw Error("Arquivo maior que o limite (foto 8 MB, TXT 512 KB).");
  const view=new DataView(buffer),bytes=new Uint8Array(buffer),at=item.offset;
  if(at+30>bytes.length||view.getUint32(at,true)!==0x04034b50)throw Error("Cabeçalho ZIP inválido.");
  const start=at+30+view.getUint16(at+26,true)+view.getUint16(at+28,true);
  if(start+item.zipped>bytes.length)throw Error("Arquivo ZIP incompleto.");
  const part=bytes.slice(start,start+item.zipped);
  let output:Uint8Array;
  if(item.method===0)output=part;
  else {
    if(typeof DecompressionStream==="undefined")throw Error("Navegador sem suporte para ZIP.");
    const stream=new Blob([Uint8Array.from(part)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const reader=stream.getReader();
    const chunks:Uint8Array[]=[];
    let size=0;
    try{
      while(true){
        const next=await reader.read();
        if(next.done)break;
        size+=next.value.byteLength;
        if(size>item.size){await reader.cancel();throw Error("Descompactação maior que o previsto.");}
        chunks.push(next.value);
      }
    }finally{reader.releaseLock();}
    output=new Uint8Array(size);
    let position=0;
    for(const chunk of chunks){output.set(chunk,position);position+=chunk.byteLength;}
  }
  if(output.byteLength!==item.size||crc32(output)!==item.crc)throw Error("Foto/TXT corrompido no ZIP.");
  return output;
}
function hasImageSignature(bytes:Uint8Array,mime:"image/jpeg"|"image/png"|"image/webp"):boolean {
  if(mime==="image/jpeg")return bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(mime==="image/png")return bytes.length>=8&&
    [137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value);
  return bytes.length>=12&&
    new TextDecoder("ascii").decode(bytes.subarray(0,4))==="RIFF"&&
    new TextDecoder("ascii").decode(bytes.subarray(8,12))==="WEBP";
}
function people(text:string,path:string):Person[]{
  const raw=text.replace(/\r\n?/g,"\n");
  const positionMarks=[...raw.matchAll(/^\s*Posi(?:ç|c)(?:ã|a)o\s*:\s*\d+\s*$/gim)].map(x=>x.index||0);
  const blocks=positionMarks.length>1?
    positionMarks.map((at,i)=>raw.slice(at,positionMarks[i+1]??raw.length)):[raw];
  const result:Person[]=[];
  for(const block of blocks){
    const cpf=(block.match(/^\s*CPF\s*:\s*([\d.\-\s]{11,24})\s*$/im)?.[1]||"").replace(/\D/g,"");
    if(!isValidCpf(cpf))continue;
    result.push({
      cpf,
      name:safeName(block.match(/^\s*Nome\s*:\s*([^\r\n]+)/im)?.[1]||""),
      position:block.match(/^\s*Posi(?:ç|c)(?:ã|a)o\s*:\s*(\d+)\s*$/im)?.[1]||null,
      uf:block.match(/^\s*Fonte\s*:\s*([A-Za-z]{2})\s*$/im)?.[1]?.toUpperCase()||null,
      stem:stem(path),dir:dirname(path),
    });
  }
  return result;
}
function cpfFromPhoto(path:string):string|null{
  const onlyDigits=basename(path).replace(/\.[^.]+$/,"").replace(/\D/g,"");
  const cpf=onlyDigits.match(/\d{11}/)?.[0]||"";
  return isValidCpf(cpf)?cpf:null;
}
function positionFromPhoto(path:string):string|null{
  return /^(?:foto|imagem|img|photo)?(\d{1,5})$/.exec(stem(path))?.[1]||null;
}
function findPerson(image:Entry,rows:Person[],photoCounts:Map<string,number>,
  peopleCounts:Map<string,number>,used:Set<Person>):Person|null{
  const folder=dirname(image.path),base=stem(image.path),cpf=cpfFromPhoto(image.path),pos=positionFromPhoto(image.path);
  const matches=rows.filter(x=>!used.has(x)).map(x=>({
    row:x,
    score:cpf===x.cpf?120
      :folder===x.dir&&base===x.stem?110
      :folder===x.dir&&pos&&pos===x.position?100
      :folder===x.dir&&photoCounts.get(folder)===1&&peopleCounts.get(folder)===1?75:0,
  })).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(!matches.length)return null;
  const top=matches.filter(x=>x.score===matches[0].score);
  return new Set(top.map(x=>x.row.cpf)).size===1?top[0].row:null;
}
export async function extractH2BicoZipPhotos(archive:File):Promise<H2BicoZipResult>{
  if(!/\.zip$/i.test(archive.name)||!archive.size||archive.size>H2BICO_ZIP_MAX_ARCHIVE_BYTES)
    throw Error("Selecione um arquivo ZIP de até 120 MB.");
  const data=await archive.arrayBuffer();
  const content=entries(data),images=content.filter(x=>photoMime(x.path));
  const txts=content.filter(x=>/\.(?:txt|csv)$/i.test(x.path));
  const issues:H2BicoZipIssue[]=[];
  const all:Person[]=[];
  for(const txt of txts){
    try{
      const found=people(decodeCpfText(await expand(data,txt)),txt.path);
      if(!found.length)issues.push({file:txt.path,reason:"Nome ou CPF inválido/ausente no TXT."});
      else all.push(...found);
    }catch(error){issues.push({file:txt.path,reason:error instanceof Error?error.message:"Falha ao ler TXT."});}
  }
  const photoCounts=new Map<string,number>(),peopleCounts=new Map<string,number>();
  for(const photo of images)photoCounts.set(dirname(photo.path),(photoCounts.get(dirname(photo.path))||0)+1);
  for(const person of all)peopleCounts.set(person.dir,(peopleCounts.get(person.dir)||0)+1);
  const used=new Set<Person>(),files:File[]=[];
  let matched=0;
  for(const img of images){
    try{
      const savedCpf=cpfFromPhoto(img.path);
      const found=findPerson(img,all,photoCounts,peopleCounts,used);
      if(found&&savedCpf&&found.cpf!==savedCpf)throw Error("CPF diferente entre foto e TXT.");
      let record=found;
      if(!record&&savedCpf){
        const base=basename(img.path).replace(/\.[^.]+$/,"");
        record={name:safeName(base.slice(0,base.indexOf(savedCpf)).replace(/[_-]/g," ")),
          cpf:savedCpf,uf:null,position:null,stem:stem(img.path),dir:dirname(img.path)};
      }
      if(!record){
        issues.push({file:img.path,reason:"Foto sem vínculo seguro com CPF/TXT; não importada."});
        continue;
      }
      const mime=photoMime(img.path)!;
      const raw=await expand(data,img);
      if(!hasImageSignature(raw,mime))throw Error("Conteúdo da foto não corresponde ao formato declarado.");
      const ext=mime==="image/png"?".png":mime==="image/webp"?".webp":".jpg";
      const filename=record.name+"_"+record.cpf+(record.uf?"_"+record.uf:"")+ext;
      files.push(new File([Uint8Array.from(raw)],filename,{type:mime,lastModified:archive.lastModified||Date.now()}));
      if(found){used.add(found);matched++;}
    }catch(error){issues.push({file:img.path,reason:error instanceof Error?error.message:"Erro ao extrair foto."});}
  }
  return {files,photosFound:images.length,metadataFound:all.length,matched,issues};
}
