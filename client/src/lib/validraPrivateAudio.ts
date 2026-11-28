// Normalize the browser-decoded sound to a bounded, canonical PCM WAV.
async function decode(file:File){
  const context=new AudioContext();
  try{return await context.decodeAudioData(await file.arrayBuffer());}
  finally{await context.close();}
}
export async function readPrivateAudioDuration(file:File){return (await decode(file)).duration;}
export async function encodePrivateWav(file:File,min:number,max:number){
  const source=await decode(file);
  if(!Number.isFinite(source.duration)||source.duration<min||source.duration>max||source.duration>300)
    throw new Error("A duração do áudio está fora do limite da pergunta.");
  const rate=16000,length=Math.floor(source.duration*rate);
  const context=new OfflineAudioContext(1,length,rate);
  const node=context.createBufferSource();node.buffer=source;node.connect(context.destination);node.start();
  const result=await context.startRendering();
  const wav=new ArrayBuffer(44+length*2),v=new DataView(wav);
  const tag=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)v.setUint8(offset+i,text.charCodeAt(i));};
  tag(0,"RIFF");v.setUint32(4,wav.byteLength-8,true);tag(8,"WAVE");tag(12,"fmt ");v.setUint32(16,16,true);
  v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);
  v.setUint16(32,2,true);v.setUint16(34,16,true);tag(36,"data");v.setUint32(40,length*2,true);
  const samples=result.getChannelData(0);
  for(let i=0;i<length;i++){const x=Math.max(-1,Math.min(1,samples[i]));v.setInt16(44+i*2,x<0?x*32768:x*32767,true);}
  return new File([wav],"resposta.wav",{type:"audio/wav"});
}
