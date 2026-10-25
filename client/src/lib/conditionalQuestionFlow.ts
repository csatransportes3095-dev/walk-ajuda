export const normalizeFlowValue = (value: string | null | undefined) =>
  String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleUpperCase('pt-BR');

export type FlowRule = { questionId: number; answer: string; action: 'continue'|'jump'|'finish'|'message'; targetQuestionId?: number|null; message?: string|null };
export function extractFlowRules(questions: Array<{id:number;fieldType:string;options:string|null}>): FlowRule[] {
  return questions.flatMap(q => {
    if(q.fieldType!=='select'||!q.options)return [];
    try {const a=JSON.parse(q.options);if(!Array.isArray(a))return [];
      return a.filter((x:any)=>x&&typeof x==='object'&&x.flowAction&&x.flowAction!=='continue')
        .map((x:any)=>({questionId:q.id,answer:String(x.label),action:x.flowAction,targetQuestionId:Number(x.flowTarget)||null,message:x.flowMessage||null}));
    }catch{return [];}
  });
}
export function applyQuestionFlow<T extends {id:number}>(ordered:T[],answers:Record<number,string>,rules:FlowRule[]):{questions:T[];ended:boolean;message:string|null}{
 const result:T[]=[];let index=0;const visited=new Set<number>();
 while(index<ordered.length){
   const q=ordered[index];if(visited.has(q.id))break;visited.add(q.id);result.push(q);
   const answer=answers[q.id]?.trim();
   const rule=answer?rules.find(r=>r.questionId===q.id&&normalizeFlowValue(r.answer)===normalizeFlowValue(answer)):undefined;
   if(rule?.action==='finish'||rule?.action==='message')return {questions:result,ended:true,message:rule.action==='message'?rule.message||null:null};
   if(rule?.action==='jump'){const next=ordered.findIndex(x=>x.id===rule.targetQuestionId);if(next>index){index=next;continue;}}
   index++;
 }
 return {questions:result,ended:false,message:null};
}
