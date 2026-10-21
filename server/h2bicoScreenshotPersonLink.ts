/**
 * H2BICO prints can show a portrait with the person's name in one section,
 * then repeat the same name alongside the CPF in a details section below.
 * They are one person, not two cards. Never associate different names or CPFs.
 */
import { isValidCpf } from "../client/src/lib/h2bicoCpfExtractor";
import { normalizeScreenshotName, type ScreenshotPerson } from "./h2bicoScreenshotOcr";

export type LinkedScreenshotPerson=ScreenshotPerson&{linkedAcrossSections?:boolean};

export function mergeRepeatedNameWithCpf<T extends ScreenshotPerson>(people:readonly T[]):(T&{linkedAcrossSections?:boolean})[]{
  const groups=new Map<string,number[]>();
  for(let i=0;i<people.length;i++){
    const person=people[i];
    const name=normalizeScreenshotName(person.name);
    if(!name||name.split(/\s+/).length<2)continue;
    const indexes=groups.get(name)||[];
    indexes.push(i);groups.set(name,indexes);
  }
  const discarded=new Set<number>();
  const replacements=new Map<number,T&{linkedAcrossSections?:boolean}>();
  for(const indexes of groups.values()){
    // Repeated names across three or more cards are ambiguous.
    if(indexes.length!==2)continue;
    const [first,second]=indexes.map(i=>people[i]);
    if([first.cpf,second.cpf].filter(Boolean).length!==1)continue;
    const nameOnlyIndex=people[indexes[0]].cpf?indexes[1]:indexes[0];
    const cpfIndex=nameOnlyIndex===indexes[0]?indexes[1]:indexes[0];
    const portrait=people[nameOnlyIndex],details=people[cpfIndex];
    if(!isValidCpf(details.cpf)||!portrait.nameBox||!details.nameBox||!details.cpfBox)continue;
    const upperName=portrait.nameBox,lowerName=details.nameBox;
    const gap=lowerName.top-(upperName.top+upperName.height);
    // Photo caption must be in an earlier, separate part of the screenshot.
    if(gap<Math.max(52,upperName.height*3.2))continue;
    if(Math.abs(upperName.left-lowerName.left)>Math.max(900,upperName.width*9)&&
       Math.abs(upperName.top-lowerName.top)<upperName.height*18)continue;
    const warnings=[...new Set([
      ...portrait.warnings.filter(w=>!/CPF n[aã]o reconhecido|preencha e confira antes de salvar/i.test(w)),
      ...details.warnings.filter(w=>!/CONFIRA RECORTE|Foto fora do modelo/i.test(w)),
      "Nome idêntico identificado na legenda da foto e nos dados do CPF: um único card.",
    ])];
    replacements.set(nameOnlyIndex,{
      ...portrait,
      cpf:details.cpf,
      cpfBox:details.cpfBox,
      confidence:Math.min(portrait.confidence,details.confidence),
      warnings,
      linkedAcrossSections:true
    });
    discarded.add(cpfIndex);
  }
  return people.flatMap((person,index)=>discarded.has(index)?[]:[replacements.get(index)||person]);
}
