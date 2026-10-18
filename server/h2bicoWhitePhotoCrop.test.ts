import { describe, it, expect } from "vitest";
import { findWhitePhotoCrop } from "../client/src/lib/h2bicoWhitePhotoCrop";

function sample(bg: [number,number,number]=[12,18,30]) {
  const width=300,height=300;
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=(y*width+x)*4;
    const white=x>=72&&x<180&&y>=60&&y<195;
    data[p]=white?248:bg[0];
    data[p+1]=white?248:bg[1];
    data[p+2]=white?248:bg[2];data[p+3]=255;
  }
  // Rosto simulado dentro do fundo branco.
  for(let y=82;y<153;y++)for(let x=105;x<148;x++){
    const p=(y*width+x)*4;
    data[p]=177;data[p+1]=135;data[p+2]=116;
  }
  return {data,width,height};
}

describe("H2BICO foto padrão com fundo branco",()=>{
  it("não leva o fundo escuro nem apaga o recorte anterior",()=>{
    const {data,width,height}=sample();
    const original={x:65,y:62,size:112};
    const copy={...original};
    const found=findWhitePhotoCrop(data,width,height,0,0,original);
    expect(found).not.toBeNull();
    expect(found!.x).toBeGreaterThanOrEqual(72);
    expect(found!.y).toBeGreaterThanOrEqual(60);
    expect(found!.x+found!.width).toBeLessThanOrEqual(180);
    expect(found!.y+found!.height).toBeLessThanOrEqual(195);
    expect(found!.height/found!.width).toBeCloseTo(1.25,1);
    expect(original).toEqual(copy);
  });
  it("não produz recorte quando não existe fundo branco",()=>{
    const {data,width,height}=sample([20,20,20]);
    data.fill(30);
    for(let i=3;i<data.length;i+=4)data[i]=255;
    expect(findWhitePhotoCrop(data,width,height,0,0,{x:65,y:62,size:112})).toBeNull();
  });
  it("aceita coordenadas locais do canvas e devolve coordenadas originais",()=>{
    const {data,width,height}=sample();
    const found=findWhitePhotoCrop(data,width,height,200,150,{x:265,y:212,size:112});
    expect(found?.x).toBeGreaterThanOrEqual(272);
    expect(found?.y).toBeGreaterThanOrEqual(210);
  });
});
