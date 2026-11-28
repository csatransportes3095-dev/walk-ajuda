// Shared form description; the server is authoritative and reconstructs all
// persisted labels, choices and document references from the current catalogue.
export type ValidraFormQuestion={
  id:number;question:string;fieldType:"text"|"textarea"|"select"|"audio";required:boolean;
  audio?:{min:number;max:number;allowRerecord:boolean;allowFileUpload:boolean;helpText?:string|null};
  parentQuestionId:number|null;triggerOption:string|null;sortOrder:number;
  choices:{label:string;blocked:boolean;action?:"continue"|"jump"|"finish"|"message";targetQuestionId?:number;message?:string}[];
};
export type ValidraFormDocument={fieldId:string;label:string;pdfOnly:boolean;imageOnly:boolean;inputSource:"both"|"camera"|"gallery"};
export type ValidraItemRequirements={productId:number;optionId:number;service:string;option:string;questions:ValidraFormQuestion[];documents:ValidraFormDocument[]};
export type ValidraItemFormInput={audioFlowId?:string;answers:{questionId:number;answer:string}[];documents:{fieldId:string;fileKey:string}[]};
export type ValidraAnswerMap=Record<number,string>;
export const normalizeValidraAnswer=(value:string|null|undefined)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toUpperCase();
export function resolveValidraQuestionFlow(questions:ValidraFormQuestion[],answers:ValidraAnswerMap){
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
  const visible:ValidraFormQuestion[]=[];
  for(let i=0;i<result.length;i++){
    const question=result[i];visible.push(question);
    const answer=normalizeValidraAnswer(answers[question.id]);
    const choice=answer&&question.fieldType==="select"?question.choices.find(c=>normalizeValidraAnswer(c.label)===answer):undefined;
    if(!choice)continue;
    if(choice.blocked)return {questions:visible,invalid:true,message:null};
    if(choice.action==="finish"||choice.action==="message")return {questions:visible,invalid:false,message:choice.action==="message"?choice.message??null:null};
    if(choice.action==="jump"){
      const next=result.findIndex(q=>q.id===choice.targetQuestionId);
      if(next<=i)return {questions:visible,invalid:true,message:null};
      i=next-1;
    }
  }
  return {questions:visible,invalid:false,message:null};
}
export function visibleValidraQuestions(questions:ValidraFormQuestion[],answers:ValidraAnswerMap){
  return resolveValidraQuestionFlow(questions,answers).questions;
}
