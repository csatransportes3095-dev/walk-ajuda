import { describe, expect, it, beforeAll } from "vitest";
import { File as NodeFile } from "node:buffer";
import { readFileSync } from "node:fs";
import { extractH2BicoZipPhotos } from "../client/src/lib/h2bicoZipImport";

type Part={name:string;data:Buffer};
function crc32(data:Buffer):number{
  let v=0xffffffff;
  for(const b of data){v^=b;for(let i=0;i<8;i++)v=(v>>>1)^((v&1)?0xedb88320:0);}
  return (v^0xffffffff)>>>0;
}
function makeZip(files:Part[]):Buffer{
  const locals:Buffer[]=[],centrals:Buffer[]=[];
  let start=0;
  for(const part of files){
    const name=Buffer.from(part.name,"utf8"),data=part.data,crc=crc32(data);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);
    local.writeUInt16LE(0x800,6);
    local.writeUInt32LE(crc,14);
    local.writeUInt32LE(data.length,18);
    local.writeUInt32LE(data.length,22);
    local.writeUInt16LE(name.length,26);
    locals.push(local,name,data);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);
    central.writeUInt16LE(20,4);
    central.writeUInt16LE(20,6);
    central.writeUInt16LE(0x800,8);
    central.writeUInt32LE(crc,16);
    central.writeUInt32LE(data.length,20);
    central.writeUInt32LE(data.length,24);
    central.writeUInt16LE(name.length,28);
    central.writeUInt32LE(start,42);
    centrals.push(central,name);
    start+=local.length+name.length+data.length;
  }
  const cd=Buffer.concat(centrals);
  const eocd=Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);
  eocd.writeUInt16LE(files.length,8);
  eocd.writeUInt16LE(files.length,10);
  eocd.writeUInt32LE(cd.length,12);
  eocd.writeUInt32LE(start,16);
  return Buffer.concat([...locals,cd,eocd]);
}
function archive(parts:Part[]):File{
  return new NodeFile([makeZip(parts)],"clientes.zip",{type:"application/zip"}) as unknown as File;
}
const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0,0,0,0,0xff,0xd9]);
const txt=(name:string,cpf:string,pos:number)=>Buffer.from(
  "Posição: "+pos+"\nNome: "+name+"\nCPF: "+cpf+"\nSemelhança: 92.9%\nFonte: SP\n","utf8");

beforeAll(()=>{
  if(typeof globalThis.File==="undefined")
    (globalThis as unknown as {File:typeof NodeFile}).File=NodeFile;
});

describe("H2BICO - importação de fotos em ZIP",()=>{
  it("lê TXT do tipo Posição/Nome/CPF e associa a foto pela posição",async()=>{
    const result=await extractH2BicoZipPhotos(archive([
      {name:"lote/1.jpg",data:jpeg},
      {name:"lote/dados.txt",data:txt("ANA EXEMPLO","529.982.247-25",1)},
    ]));
    expect(result.photosFound).toBe(1);
    expect(result.metadataFound).toBe(1);
    expect(result.matched).toBe(1);
    expect(result.issues).toHaveLength(0);
    expect(result.files[0].name).toBe("ANA EXEMPLO_52998224725_SP.jpg");
  });
  it("distingue dois registros e não troca foto de um CPF pelo outro",async()=>{
    const result=await extractH2BicoZipPhotos(archive([
      {name:"fotos/1.jpg",data:jpeg},
      {name:"fotos/2.jpg",data:jpeg},
      {name:"fotos/dados.txt",data:Buffer.from(
        txt("ANA EXEMPLO","529.982.247-25",1).toString()+"\n"+
        txt("BRUNO EXEMPLO","123.456.789-09",2).toString())},
    ]));
    expect(result.files.map(x=>x.name)).toEqual([
      "ANA EXEMPLO_52998224725_SP.jpg",
      "BRUNO EXEMPLO_12345678909_SP.jpg",
    ]);
    expect(result.matched).toBe(2);
  });
  it("sem vínculo inequívoco não importa a foto por aproximação",async()=>{
    const result=await extractH2BicoZipPhotos(archive([
      {name:"fotos/usuario-a.jpg",data:jpeg},
      {name:"fotos/usuario-b.jpg",data:jpeg},
      {name:"fotos/dados.txt",data:txt("ANA EXEMPLO","529.982.247-25",1)},
    ]));
    expect(result.files).toHaveLength(0);
    expect(result.issues).toHaveLength(2);
  });
  it("rejeita arquivos ZIP com caminhos inseguros",async()=>{
    await expect(extractH2BicoZipPhotos(archive([
      {name:"../arquivo.jpg",data:jpeg},
    ]))).rejects.toThrow(/inseguro/);
  });
  it("recusa imagem falsa com extensão JPG e registra pendência",async()=>{
    const result=await extractH2BicoZipPhotos(archive([
      {name:"lote/1.jpg",data:Buffer.from("<script>não é foto</script>")},
      {name:"lote/meta.txt",data:txt("ANA EXEMPLO","529.982.247-25",1)},
    ]));
    expect(result.files).toHaveLength(0);
    expect(result.issues[0].reason).toMatch(/formato/);
  });
  it("mantém a importação tradicional e exige conferência antes do envio",()=>{
    const ui=readFileSync("client/src/pages/AdminH2Bico.tsx","utf8");
    const server=readFileSync("server/routers/h2bico.ts","utf8");
    expect(ui).toContain("IMPORTAR LOTE ZIP");
    expect(ui).toContain("extractH2BicoZipPhotos");
    expect(ui).toContain("SELECIONAR VÁRIAS FOTOS");
    expect(ui).toContain("ADICIONAR PASTA");
    expect(ui).toContain("prepareFiles(found)");
    expect(ui).toContain("IMPORTAR \${readyBatch.length} FOTO(S)");
    expect(server).toContain("importPhoto: adminProcedure.input");
    expect(server).toContain("WHERE cpf = \${parsed.cpf}");
  });
});
