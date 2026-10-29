/**
 * UI-only preselection; the user still presses "SALVAR" explicitly.
 * Never preselect duplicates, invalid CPF/name, uncertain associations or
 * records without the new independently detected white-background portrait.
 */
export type DetectedPhoto = {x:number;y:number;width:number;height:number};
export type PhotoReviewCandidate = {
  alreadyExists:boolean;
  validCpf:boolean;
  name:string;
  confidence:number;
  cpfSuggestion?:string|null;
  whitePhotoCrop?:DetectedPhoto|null;
  crop?:{x:number;y:number;size:number};
  warnings?:readonly string[];
};

export function shouldPreselectH2BicoPhoto(row:PhotoReviewCandidate):boolean{
  const crop=row.whitePhotoCrop;
  const fallback=row.crop;
  if(row.alreadyExists||!row.validCpf||row.cpfSuggestion)return false;
  if(!Number.isFinite(row.confidence)||row.confidence<70)return false;
  if(crop){
    if(![crop.x,crop.y,crop.width,crop.height].every(Number.isFinite)||
        crop.x<0||crop.y<0||crop.width<48||crop.height<60)return false;
    const ratio=crop.height/crop.width;
    if(ratio<1.20||ratio>1.30)return false;
  }else if(!fallback||![fallback.x,fallback.y,fallback.size].every(Number.isFinite)||
      fallback.x<0||fallback.y<0||fallback.size<48)return false;
  // A warning about the *legacy* crop border is not a blocker once the
  // new white crop has been independently found. CPF uncertainty still is.
  if((row.warnings||[]).some(message=>
    /CONFIRA O N[UÚ]MERO|CPF REPETIDO|RECORTE ESCURO|LEITURA DIVERGENTE/i.test(message)
  ))return false;
  return true;
}

/** Preserve the 11 digits and any leading zeros; one missing CPF per line. */
export function formatMissingH2BicoCpfs(cpfs:readonly string[]):string{
  return cpfs.join("\n");
}
