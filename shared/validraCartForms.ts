// Shared form description; the server is authoritative and reconstructs all
// persisted labels, choices and document references from the current catalogue.
export type ValidraFormQuestion={
  id:number;question:string;fieldType:"text"|"textarea"|"select";required:boolean;
  parentQuestionId:number|null;triggerOption:string|null;sortOrder:number;
  choices:{label:string;blocked:boolean}[];
};
export type ValidraFormDocument={fieldId:string;label:string;pdfOnly:boolean;imageOnly:boolean;inputSource:"both"|"camera"|"gallery"};
export type ValidraItemRequirements={productId:number;optionId:number;service:string;option:string;questions:ValidraFormQuestion[];documents:ValidraFormDocument[]};
export type ValidraItemFormInput={answers:{questionId:number;answer:string}[];documents:{fieldId:string;fileKey:string}[]};
export type ValidraAnswerMap=Record<number,string>;
export const normalizeValidraAnswer=(value:string|null|undefined)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toUpperCase();
export function visibleValidraQuestions(questions:ValidraFormQuestion[],answers:ValidraAnswerMap){
  const result:ValidraFormQuestion[]=[];
  const visited=new Set<number>();
  const ordered=[...questions].sort((a,b)=>a.sortOrder-b.sortOrder||a.id-b.id);
  function visit(q:ValidraFormQuestion){
    if(visited.has(q.id))return;
    visited.add(q.id);result.push(q);
    for(const child of ordered.filter(x=>x.parentQuestionId===q.id)){
      if(!child.triggerOption||normalizeValidraAnswer(answers[q.id])===normalizeValidraAnswer(child.triggerOption))visit(child);
    }
  }
  ordered.filter(q=>q.parentQuestionId===null).forEach(visit);
  return result;
}
