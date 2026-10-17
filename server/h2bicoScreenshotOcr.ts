/**
 * OCR from ranking screenshots. Output contains a separate image crop, name and
 * CPF suggestion for each card. Never infer/correct a CPF digit from its checksum.
 * Staff must review all data and crops before import into H2BICO.
 */
export type ScreenshotCrop = {x:number;y:number;size:number};
export type ScreenshotPerson = {
  name:string; cpf:string; crop:ScreenshotCrop; confidence:number; warnings:string[];
};
type Word = {text:string;left:number;top:number;width:number;height:number;confidence:number};
type TextLine = Word;

// Tesseract often substitutes comma/colon for CPF dots or hyphens, and may
// insert extra whitespace between the 3-digit blocks. Never change digits.
const cpfPattern = /(?<!\d)\d{3}[\s.,:;]{0,3}\d{3}[\s.,:;]{0,3}\d{3}[\s.,:;\-–—]{0,3}\d{2}(?!\d)/g;
export const cpfDigits=(value:string)=>value.replace(/\D/g,"");
export function cpfCandidatesInOcrLine(text:string):string[]{
  const normalized=text.replace(/[\u00a0\u2007\u202f]/g," ");
  return [...normalized.matchAll(cpfPattern)].map(match=>cpfDigits(match[0]));
}
export function normalizeScreenshotName(value:string):string {
  return value.normalize("NFC").toLocaleUpperCase("pt-BR")
    .replace(/\b(?:CONSULTAR|BAIXAR|SEMELHAN[CÇ]A|ALTA|M[EÉ]DIA|RESULTADO|DISPON[IÍ]VEL)\b/gu," ")
    .replace(/[^A-ZÀ-ÖØ-Ý\s'-]/gu," ")
    .replace(/\s+/g," ").trim().slice(0,200);
}
export function isReviewableName(name:string):boolean{
  const words=name.trim().split(/\s+/).filter(Boolean);
  return words.length>=2&&name.length>=6&&words.every(word=>word.length>=2||["A","E","O"].includes(word));
}

function median(values:number[]):number|null {
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
export function parseScreenshotTsv(tsv:string,width:number,height:number):ScreenshotPerson[]{
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<200||height<200)return [];
  const groups=new Map<string,Word[]>();
  for(const line of tsv.split(/\r?\n/).slice(1)){
    const columns=line.split("\t");
    if(columns.length<12||columns[0]!=="5")continue;
    const text=columns.slice(11).join("\t").trim();
    const left=Number(columns[6]),top=Number(columns[7]),w=Number(columns[8]),h=Number(columns[9]),confidence=Number(columns[10]);
    if(!text||![left,top,w,h,confidence].every(Number.isFinite)||w<=0||h<=0)continue;
    const key=columns[2]+"-"+columns[3]+"-"+columns[4];
    const words=groups.get(key)||[];
    words.push({text,left,top,width:w,height:h,confidence});
    groups.set(key,words);
  }
  const lines:TextLine[]=[...groups.values()].map(words=>{
    words.sort((a,b)=>a.left-b.left);
    const left=Math.min(...words.map(w=>w.left));
    const top=Math.min(...words.map(w=>w.top));
    const right=Math.max(...words.map(w=>w.left+w.width));
    const bottom=Math.max(...words.map(w=>w.top+w.height));
    return {text:words.map(w=>w.text).join(" "),left,top,width:right-left,height:bottom-top,
      confidence:words.reduce((sum,w)=>sum+Math.max(0,w.confidence),0)/words.length};
  }).sort((a,b)=>a.top-b.top||a.left-b.left);

  // Start with the *name cards*, not just already-readable CPFs: a missing
  // number must not silently hide one of the people visible in the screenshot.
  const nameLines=lines.filter(line=>{
    const text=line.text.trim();
    if(/\d/.test(text)||line.confidence<53)return false;
    if(line.left<width*0.08||line.left>width*0.8)return false;
    const normalized=normalizeScreenshotName(text);
    if(!isReviewableName(normalized))return false;
    // Card names are rendered in uppercase. UI labels may be title case.
    const letters=text.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g,"");
    return letters.length>=6&&letters===letters.toLocaleUpperCase("pt-BR");
  });
  const numberLines=lines.flatMap(line=>cpfCandidatesInOcrLine(line.text).map(cpf=>({line,cpf})));
  const matchedNames=nameLines.map(nameLine=>{
    const numberCandidates=numberLines.filter(({line})=>{
      const dy=line.top-nameLine.top;
      return dy>nameLine.height*0.8 && dy<Math.max(nameLine.height*10,110)
        &&Math.abs(nameLine.left-line.left)<Math.max(105,nameLine.height*5);
    });
    numberCandidates.sort((a,b)=>{
      const rank=(entry:typeof numberCandidates[number])=>Math.abs(entry.line.left-nameLine.left)*1.2
        +Math.abs((entry.line.top-nameLine.top)-nameLine.height*2.15);
      return rank(a)-rank(b);
    });
    return {nameLine,cpfCandidate:numberCandidates[0]||null};
  });
  // Drop unrelated UI titles. Keep OCR-missing card names when they line up
  // with the other cards, so administrators can fill the missing CPF manually.
  const reliable=matchedNames.filter(entry=>entry.cpfCandidate);
  const alignedX=median(reliable.map(entry=>entry.nameLine.left));
  const anchors=matchedNames.filter(entry=>entry.cpfCandidate||
    (alignedX!==null&&Math.abs(entry.nameLine.left-alignedX)<Math.max(32,width*0.025)));
  const sortedAnchors=[...anchors].sort((a,b)=>a.nameLine.top-b.nameLine.top);
  const pitches:number[]=[];
  for(let i=1;i<sortedAnchors.length;i++){
    const delta=sortedAnchors[i].nameLine.top-sortedAnchors[i-1].nameLine.top;
    if(delta>sortedAnchors[i-1].nameLine.height*5&&delta<height*0.38)pitches.push(delta);
  }
  const pitch=median(pitches);
  const seen=new Set<string>();
  const output:ScreenshotPerson[]=[];
  for(const entry of sortedAnchors){
    const {nameLine,cpfCandidate}=entry;
    const name=normalizeScreenshotName(nameLine.text);
    const cpf=cpfCandidate?.cpf||"";
    if(cpf&&seen.has(cpf))continue;
    if(cpf)seen.add(cpf);
    const basisSize=pitch!==null?pitch*0.46:nameLine.height*6.7;
    const size=Math.round(Math.max(48,Math.min(basisSize,width*0.24,height*0.28)));
    const gap=Math.max(9,Math.round(nameLine.height*1.48));
    const x=Math.round(Math.max(0,Math.min(width-size,nameLine.left-size-gap)));
    const y=Math.round(Math.max(0,Math.min(height-size,nameLine.top-nameLine.height*0.69)));
    const confidence=Math.round(Math.max(0,Math.min(100,(nameLine.confidence+(cpfCandidate?.line.confidence||0))/(cpfCandidate?2:1))));
    const warnings:string[]=[];
    if(!cpf)warnings.push("CPF não reconhecido: preencha e confira antes de salvar.");
    if(confidence<75)warnings.push("Leitura de texto com baixa confiança; confira nome e CPF.");
    if(size<60)warnings.push("Foto pequena: confira o recorte.");
    output.push({name,cpf,crop:{x,y,size},confidence,warnings});
    if(output.length>=80)break;
  }
  return output;
}
