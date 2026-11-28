export const VALIDRA_AUDIO_RATE=16000;
export const VALIDRA_AUDIO_MAX_BYTES=44+VALIDRA_AUDIO_RATE*2*300;
export type ValidraAudioScope={flowId:string;itemIndex:number;productId:number;optionId:number;questionId:number};
export function validraAudioScopeLabel(scope:ValidraAudioScope){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope.flowId)||
      !Number.isSafeInteger(scope.itemIndex)||scope.itemIndex<0||scope.itemIndex>=30||
      ![scope.productId,scope.optionId,scope.questionId].every(n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647))
    throw new Error("validra_cart_form_invalid");
  return ["audio",scope.flowId,scope.itemIndex,scope.productId,scope.optionId,scope.questionId].join(":");
}
export function validraWavDuration(byteLength:number){
  if(!Number.isSafeInteger(byteLength)||byteLength<=44||byteLength>VALIDRA_AUDIO_MAX_BYTES||(byteLength-44)%2)
    throw new Error("validra_invalid_document");
  return (byteLength-44)/(VALIDRA_AUDIO_RATE*2);
}
export function validateValidraWav(buffer:Buffer){
  const duration=validraWavDuration(buffer.length);
  if(buffer.toString("ascii",0,4)!=="RIFF"||buffer.readUInt32LE(4)!==buffer.length-8||
      buffer.toString("ascii",8,16)!=="WAVEfmt "||buffer.readUInt32LE(16)!==16||
      buffer.readUInt16LE(20)!==1||buffer.readUInt16LE(22)!==1||buffer.readUInt32LE(24)!==VALIDRA_AUDIO_RATE||
      buffer.readUInt32LE(28)!==VALIDRA_AUDIO_RATE*2||buffer.readUInt16LE(32)!==2||buffer.readUInt16LE(34)!==16||
      buffer.toString("ascii",36,40)!=="data"||buffer.readUInt32LE(40)!==buffer.length-44)
    throw new Error("validra_invalid_document");
  return duration;
}
export function validraAudioKey(key:string){return /^order-docs\/validra-audio-[0-9a-f-]{36}\.wav$/.test(key);}
