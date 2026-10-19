export type VisibilityMode = "normal" | "selected" | "current_only";
export type StatusVisibilityRule = { flowId: number; triggerKey: string; mode: VisibilityMode; hiddenKeys: string[]; showNext: boolean; showProgress: boolean };
export const DEFAULT_VISIBILITY = { mode:"normal", hiddenKeys:[], showNext:true, showProgress:true } as const;
export function resolveVisibility(input: {flowId:number; currentKey:string; keys:string[]; rules:StatusVisibilityRule[]}) {
 const rule=input.rules.find(r=>r.flowId===input.flowId && r.triggerKey===input.currentKey)
   ?? input.rules.find(r=>r.flowId===0 && r.triggerKey===input.currentKey);
 if(!rule || rule.mode==="normal") return {keys:input.keys, showNext:true,showProgress:true};
 if(rule.mode==="current_only")return {keys:[input.currentKey],showNext:false,showProgress:false};
 const hidden=new Set(rule.hiddenKeys.filter(k=>k!==input.currentKey));
 const keys=input.keys.filter(k=>!hidden.has(k));
 return {keys:keys.includes(input.currentKey)?keys:[...keys,input.currentKey],showNext:rule.showNext,showProgress:rule.showProgress};
}
