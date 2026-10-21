/**
 * OCR from ranking screenshots. Output contains a separate image crop, name and
 * CPF suggestion for each card. Never infer/correct a CPF digit from its checksum.
 * Staff must review all data and crops before import into H2BICO.
 */
export type ScreenshotCrop = {x:number;y:number;size:number};
export type ScreenshotPerson = {
  name:string; cpf:string; crop:ScreenshotCrop; confidence:number; warnings:string[]; photoLayout?:"left"|"right"|"above"; nameBox?:{left:number;top:number;width:number;height:number}; cpfBox?:{left:number;top:number;width:number;height:number};
};
type Word = {text:string;left:number;top:number;width:number;height:number;confidence:number};
type TextLine = Word;

// Tesseract often substitutes comma/colon for CPF dots or hyphens, and may
// insert extra whitespace between the 3-digit blocks. Never change digits.
const cpfPattern = /(?<!\d)\d{3}[\s.,:;]{0,3}\d{3}[\s.,:;]{0,3}\d{3}[\s.,:;\-–—]{0,3}\d{2}(?!\d)/g;
export const cpfDigits=(value:string)=>value.replace(/\D/g,"");
export function cpfCandidatesInOcrLine(text:string):string[]{
  const normalized=text.replace(/[\u00a0\u2007\u202f]/g," ")
    .replace(/\s*([.,:;\-–—])\s*/g,"$1");
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

type NameAnchor={line:TextLine;name:string;uppercase:boolean;inlineCpf:boolean};
type NumberAnchor={line:TextLine;cpf:string};

const ignoredLabels = /^(?:COM FOTO|SEM FOTO|FOTO DISPON[IÍ]VEL|SEM IMAGEM|NOME COMPLETO|DOCUMENTO V[AÁ]LIDO|RESULTADOS?|BUSCAR PESSOA|BUSCA AVAN[CÇ]ADA|DATA DE NASCIMENTO|PESQUISAR NOME|SIMILARIDADE FACIAL|CONSULTA FINALIZADA|CONFIRMAR FOTO|FOTO APROVADA|FOTO EM AN[AÁ]LISE|CPF V[AÁ]LIDO|CPF INV[AÁ]LIDO|PESSOA LOCALIZADA|PESSOA ENCONTRADA|IMAGEM ORIGINAL|IMAGEM CAPTURADA|NENHUM RESULTADO)$/u;

function possibleName(value:string):string|null {
  // Some prints put the name on the SAME OCR line as CPF, or prefix it with
  // "Nome:"; strip these UI labels without changing a person's name.
  const match=[...value.matchAll(cpfPattern)][0];
  if(match && match.index!==undefined){
    const before=value.slice(0,match.index);
    const after=value.slice(match.index+match[0].length);
    value=before.replace(/\bCPF\b\s*[:\-]?\s*$/iu,"").length>=after.length?before:after;
  }
  const cleaned=normalizeScreenshotName(value
    .replace(/^\s*(?:NOME(?:\s+COMPLETO)?|TITULAR)\s*[:\-]\s*/iu,"")
    .replace(/\bCPF\s*[:\-]?/giu," "));
  if(!isReviewableName(cleaned) || ignoredLabels.test(cleaned) || /FREQU[EÊ]NCIA\s+DE\s+FACE|(?:ALTA|M[EÉ]DIA)\s+SIMILARIDADE|FACE\s+DETECTADA|OLHOS\s+NARIZ\s+BOCA/iu.test(cleaned))return null;
  const words=cleaned.split(" ");
  if(words.length>9 || /\b(?:RESULTADOS?|CONSULTAR|VISUALIZAR|SELECIONAR|CARREGAR|DISPON[IÍ]VEL|CADASTRADO|CONFERIDO|APROVADA|DESCARTADO|SIMILARIDADE|DOCUMENTOS?|BUSCAR|PESQUISAR)\b/u.test(cleaned))return null;
  return cleaned;
}

function proximity(name:TextLine,number:TextLine,width:number):number|null {
  if(name===number)return 0;
  const dy=number.top-name.top;
  const dx=Math.abs(number.left-name.left);
  const lineHeight=Math.max(name.height,number.height,12);
  const verticalLimit=Math.max(120,lineHeight*9.5);
  const horizontalLimit=Math.max(125,Math.min(width*.29,name.width*1.25+35));
  // CPF on the row immediately below (or, in some layouts, above) the name.
  if(dx<=horizontalLimit && dy>lineHeight*.55 && dy<verticalLimit){
    return .2+Math.abs(dy-lineHeight*2)/Math.max(12,lineHeight)+dx/Math.max(80,horizontalLimit);
  }
  if(dx<=horizontalLimit && dy< -lineHeight*.55 && dy> -verticalLimit*.65){
    return 1.35+Math.abs(dy+lineHeight*1.7)/Math.max(12,lineHeight)+dx/Math.max(80,horizontalLimit);
  }
  // Detail views place "CPF" beside the name, rather than underneath it.
  const rightGap=number.left-(name.left+name.width);
  const leftGap=name.left-(number.left+number.width);
  if(Math.abs(dy)<=lineHeight*1.3 &&
      ((rightGap>=-12&&rightGap<width*.28)||(leftGap>=-12&&leftGap<width*.28))){
    return 1.75+Math.max(0,rightGap,leftGap)/Math.max(100,width*.28);
  }
  return null;
}


// Tesseract can split the 3-3-3-2 CPF groups into different TSV lines or
// blocks even when they appear on the same visual row. Recombine only nearby
// boxes, without joining two distant columns or guessing any digits.
function findCpfNumbers(lines:TextLine[],width:number):NumberAnchor[]{
  const numbers=findCpfNumbers(lines,width);
  const rows:TextLine[][]=[];
  for(const line of lines){
    const center=line.top+line.height/2;
    const row=rows.find(group=>{
      const first=group[0];
      return Math.abs(center-(first.top+first.height/2))<=
        Math.max(first.height,line.height)*.58;
    });
    if(row)row.push(line);
    else rows.push([line]);
  }
  for(const row of rows){
    const ordered=[...row].sort((a,b)=>a.left-b.left);
    let segment:TextLine[]=[];
    const flush=()=>{
      if(segment.length<=1)return;
      const left=Math.min(...segment.map(item=>item.left));
      const top=Math.min(...segment.map(item=>item.top));
      const right=Math.max(...segment.map(item=>item.left+item.width));
      const bottom=Math.max(...segment.map(item=>item.top+item.height));
      const line:TextLine={text:segment.map(item=>item.text).join(" "),
        left,top,width:right-left,height:bottom-top,
        confidence:segment.reduce((sum,item)=>sum+item.confidence,0)/segment.length};
      for(const cpf of cpfCandidatesInOcrLine(line.text)){
        if(numbers.some(found=>found.cpf===cpf &&
          Math.abs(found.line.top-line.top)<=Math.max(16,line.height*1.5) &&
          Math.abs(found.line.left-line.left)<=Math.max(55,line.width)))continue;
        numbers.push({line,cpf});
      }
    };
    for(const line of ordered){
      const last=segment[segment.length-1];
      if(last){
        const gap=line.left-last.left-last.width;
        const maxGap=Math.max(35,Math.min(width*.04,Math.max(line.height,last.height)*4));
        if(gap>maxGap){flush();segment=[];}
      }
      segment.push(line);
    }
    flush();
  }
  return numbers;
}

export function parseScreenshotTsv(tsv:string,width:number,height:number):ScreenshotPerson[]{
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<200||height<200)return [];
  const groups=new Map<string,Word[]>();
  for(const row of tsv.split(/\r?\n/).slice(1)){
    const columns=row.split("\t");
    if(columns.length<12||columns[0]!=="5")continue;
    const text=columns.slice(11).join("\t").trim();
    const left=Number(columns[6]),top=Number(columns[7]),w=Number(columns[8]),h=Number(columns[9]),confidence=Number(columns[10]);
    if(!text||![left,top,w,h,confidence].every(Number.isFinite)||w<=0||h<=0)continue;
    const key=columns[1]+"-"+columns[2]+"-"+columns[3]+"-"+columns[4];
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

  // CPF and name candidates are independently located. We do NOT assume that
  // the card has the photo on the left or that its text is in uppercase.
  const numbers:NumberAnchor[]=lines.flatMap(line=>
    cpfCandidatesInOcrLine(line.text).map(cpf=>({line,cpf})));
  const nameParts:NameAnchor[]=lines.flatMap(line=>{
    if(line.confidence<45||line.left<0||line.left>width*.96)return [];
    const name=possibleName(line.text);
    if(!name)return [];
    const letters=line.text.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g,"");
    return [{line,name,uppercase:letters===letters.toLocaleUpperCase("pt-BR"),
      inlineCpf:cpfCandidatesInOcrLine(line.text).length>0}];
  });

  // A long name can wrap onto the next OCR line, but never merge two people
  // from distinct columns or cards.
  const merged:NameAnchor[]=[];
  const consumed=new Set<number>();
  for(let i=0;i<nameParts.length;i++){
    if(consumed.has(i))continue;
    const current={...nameParts[i]};
    if(!current.inlineCpf){
      const follower=nameParts.findIndex((next,index)=>index>i&&!consumed.has(index)&&
        !next.inlineCpf&&next.uppercase===current.uppercase&&
        next.line.top>current.line.top+current.line.height*.65&&
        next.line.top-current.line.top<Math.max(43,current.line.height*2.6)&&
        Math.abs(next.line.left-current.line.left)<Math.max(22,width*.025)&&
        current.name.split(" ").length+next.name.split(" ").length<=8);
      if(follower>=0){
        const next=nameParts[follower];
        // Only join when the two text lines actually touch within the card.
        const betweenCpf=numbers.some(n=>n.line.top>current.line.top&&n.line.top<next.line.top);
        if(!betweenCpf){
          current.name+=" "+next.name;
          current.line={...current.line,width:Math.max(current.line.width,next.line.width),
            height:next.line.top+next.line.height-current.line.top,
            confidence:(current.line.confidence+next.line.confidence)/2};
          consumed.add(follower);
        }
      }
    }
    merged.push(current);
  }

  // One-to-one spatial assignment: a single CPF must never be attached to
  // multiple people, particularly on side-by-side multi-column prints.
  const edges:{nameIndex:number;numberIndex:number;score:number}[]=[];
  for(let ni=0;ni<merged.length;ni++){
    for(let ci=0;ci<numbers.length;ci++){
      const score=proximity(merged[ni].line,numbers[ci].line,width);
      if(score!==null){
        edges.push({nameIndex:ni,numberIndex:ci,score:score+
          (merged[ni].uppercase?0:.25)+(isReviewableName(merged[ni].name)?0:4)});
      }
    }
  }
  edges.sort((a,b)=>a.score-b.score);
  const paired=new Map<number,NumberAnchor>();
  const usedNumbers=new Set<number>();
  for(const edge of edges){
    if(paired.has(edge.nameIndex)||usedNumbers.has(edge.numberIndex))continue;
    paired.set(edge.nameIndex,numbers[edge.numberIndex]);
    usedNumbers.add(edge.numberIndex);
  }

  const reliable=merged.filter((name,index)=>paired.has(index));
  const anchors=merged.map((name,index)=>({name,number:paired.get(index)||null})).filter(({name,number})=>
    number!==null ||
    (name.uppercase&&name.line.confidence>=65&&reliable.some(good=>
      Math.abs(good.line.left-name.line.left)<Math.max(35,width*.035) &&
      Math.abs(good.line.top-name.line.top)<height*.7)));
  anchors.sort((a,b)=>a.name.line.top-b.name.line.top||a.name.line.left-b.name.line.left);
  const pitches:number[]=[];
  for(let i=1;i<anchors.length;i++){
    const delta=anchors[i].name.line.top-anchors[i-1].name.line.top;
    if(delta>anchors[i-1].name.line.height*4&&delta<height*.38&&
      Math.abs(anchors[i].name.line.left-anchors[i-1].name.line.left)<width*.08)pitches.push(delta);
  }
  const pitch=median(pitches);
  const seen=new Set<string>();
  const output:ScreenshotPerson[]=[];
  for(const {name,number} of anchors){
    const line=name.line,cpf=number?.cpf||"";
    if(cpf&&seen.has(cpf))continue;
    if(cpf)seen.add(cpf);
    const basisSize=pitch!==null?pitch*.46:Math.max(62,line.height*6.7);
    const size=Math.round(Math.max(48,Math.min(basisSize,width*.24,height*.28)));
    const gap=Math.max(9,Math.round(line.height*1.48));
    const leftRoom=line.left;
    const rightRoom=width-(line.left+line.width);
    const photoLayout:"left"|"right"|"above"=
      leftRoom>=size+gap*.8?"left":rightRoom>=size+gap?"right":"above";
    const x=photoLayout==="left"?line.left-size-gap:
      photoLayout==="right"?line.left+line.width+gap:
      line.left+(line.width-size)/2;
    const y=photoLayout==="above"?line.top-size-gap:line.top-line.height*.69;
    const crop={x:Math.round(Math.max(0,Math.min(width-size,x))),
      y:Math.round(Math.max(0,Math.min(height-size,y))),size};
    const confidence=Math.round(Math.max(0,Math.min(100,
      (line.confidence+(number?.line.confidence||0))/(number?2:1))));
    const warnings:string[]=[];
    if(!cpf)warnings.push("CPF não reconhecido: preencha e confira antes de salvar.");
    if(!name.uppercase)warnings.push("Nome em formato diferente: confira a associação com o CPF.");
    if(photoLayout!=="left")warnings.push("CONFIRA RECORTE: foto fora do modelo tradicional à esquerda.");
    if(confidence<75)warnings.push("Leitura de texto com baixa confiança; confira nome e CPF.");
    if(size<60)warnings.push("Foto pequena: confira o recorte.");
    output.push({name:name.name,cpf,crop,photoLayout,confidence,warnings,
      nameBox:{left:line.left,top:line.top,width:line.width,height:line.height},
      cpfBox:number?{left:number.line.left,top:number.line.top,width:number.line.width,height:number.line.height}:undefined});
    if(output.length>=80)break;
  }

  // Safety fallback: a readable CPF must never disappear just because OCR
  // could not associate it with a complete name. The administrator can
  // review the original print, type the name and correct the photo crop.
  // No CPF-only result is ever pre-approved for saving.
  for(const number of numbers){
    if(output.length>=80)break;
    if(seen.has(number.cpf))continue;
    seen.add(number.cpf);
    const line=number.line;
    const size=Math.round(Math.max(48,Math.min(width*.24,height*.28,line.height*7)));
    const gap=Math.max(10,Math.round(line.height*1.5));
    const leftRoom=line.left,rightRoom=width-line.left-line.width;
    const photoLayout:"left"|"right"|"above"=
      leftRoom>=size+gap?"left":rightRoom>=size+gap?"right":"above";
    const x=photoLayout==="left"?line.left-size-gap:
      photoLayout==="right"?line.left+line.width+gap:
      line.left+(line.width-size)/2;
    const y=photoLayout==="above"?line.top-size-gap:line.top-line.height*.75;
    output.push({
      name:"",cpf:number.cpf,
      crop:{x:Math.round(Math.max(0,Math.min(width-size,x))),
        y:Math.round(Math.max(0,Math.min(height-size,y))),size},
      photoLayout,confidence:Math.min(50,Math.max(0,Math.round(line.confidence))),
      cpfBox:{left:line.left,top:line.top,width:line.width,height:line.height},
      warnings:[
        "CPF encontrado, mas nome não identificado. Digite o nome após conferir o print.",
        "CONFIRA RECORTE: foto estimada, ajuste a posição antes de salvar.",
      ],
    });
  }
  return output;
}
