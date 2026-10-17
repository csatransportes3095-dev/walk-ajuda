import { isValidCpf } from "../client/src/lib/h2bicoCpfExtractor";

/**
 * Proposes a CPF for HUMAN REVIEW only. This never proves identity and never
 * automatically replaces, selects or persists a CPF read from an image.
 *
 * A checksum alone is insufficient: search only a single OCR-confusable digit,
 * only in the first nine positions, and display a proposal only if UNIQUE.
 */
const OCR_CONFUSIONS: Readonly<Record<string, readonly string[]>> = {
  "0":["6","8"],
  "1":["7"],
  "2":["7"],
  "3":["8","9"],
  "4":["9"],
  "5":["3","6","9"],
  "6":["0","5","8"],
  "7":["1","2"],
  "8":["0","3","6","9"],
  "9":["3","4","5","8"],
};

export function suggestCpfFromMisreadDigits(readValue: string): string | null {
  const cpf=readValue.replace(/\D/g,"");
  if(!/^\d{11}$/.test(cpf)||isValidCpf(cpf))return null;
  const candidates=new Set<string>();
  for(let i=0;i<9;i++){
    for(const alt of OCR_CONFUSIONS[cpf[i]]||[]){
      const candidate=cpf.slice(0,i)+alt+cpf.slice(i+1);
      if(isValidCpf(candidate)){
        candidates.add(candidate);
        if(candidates.size>1)return null;
      }
    }
  }
  return candidates.size===1?[...candidates][0]:null;
}
