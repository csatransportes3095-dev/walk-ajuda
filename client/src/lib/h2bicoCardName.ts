import {isReviewableName,normalizeScreenshotName} from "../../server/h2bicoScreenshotOcr";
export function resolveH2BicoCardName(ocrName:string,existingName:string|null|undefined,alreadyExists:boolean){
 const valid=(raw:string|null|undefined)=>{
   const name=normalizeScreenshotName(raw||"");
   return isReviewableName(name)&&!/(?:SEM NOME|NOME COMPLETO|FREQUENCIA DE FACE|FACE DETECTADA|SIMILARIDADE)/.test(name)?name:"";
 };
 const saved=valid(existingName),ocr=valid(ocrName);
 if(alreadyExists&&saved)return {name:saved,source:"cadastro" as const,warning:ocr&&ocr!==saved?"Nome do print diferente do cadastro. Mantido o nome cadastrado.":null};
 if(ocr)return {name:ocr,source:"ocr" as const,warning:null};
 return {name:"",source:"pending" as const,warning:"Nome não localizado. Preenchimento pendente."};
}
