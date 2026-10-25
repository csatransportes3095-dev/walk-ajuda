/** Client-safe order history grouping shared by the H2 AUTO lookup and its tests.
 * This module has no DB, network, or authentication side effects.
 */
export type H2AutoStatusRow = {
  id: number;
  registrationId: number;
  orderNumber: number | null;
  status: string;
  statusLabel: string | null;
  serviceName: string | null;
  serviceOption: string | null;
  createdAt: Date | string;
};
export type H2AutoHiddenRow = {registrationId:number;subOrderIndex:number};
export type H2AutoOrderItem = {
  registrationId:number;subOrderIndex:number;orderNumber:number|null;
  serviceName:string;serviceOption:string;status:string;statusLabel:string;updatedAt:Date|string;
};
const present = (value:unknown):value is string =>
  typeof value === "string" && value.trim().length>0 && value!=="NULL" && value!=="null";

/** Mirrors order-listing behavior: split by the initial status, then reverse.
 * SubOrderIndex zero is ALWAYS the latest suborder, and soft-deleted items are excluded.
 */
export function groupVisibleH2AutoOrders(
  history:readonly H2AutoStatusRow[],
  hidden:readonly H2AutoHiddenRow[],
  initialStatus:string,
  maxOrders=20,
):H2AutoOrderItem[]{
  const hiddenSet=new Set(hidden.map(x=>String(x.registrationId)+":"+String(x.subOrderIndex)));
  const grouped=new Map<number,H2AutoStatusRow[]>();
  for(const entry of history){
    const id=Number(entry.registrationId);
    if(!Number.isSafeInteger(id)||id<1)continue;
    if(!grouped.has(id))grouped.set(id,[]);
    grouped.get(id)!.push(entry);
  }
  const result:H2AutoOrderItem[]=[];
  for(const [registrationId,entries] of grouped){
    // DB returns rows in ascending chronological order; make deterministic within a registration.
    const ordered=[...entries].sort((a,b)=>
      new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime() || Number(a.id)-Number(b.id));
    const chronological:H2AutoStatusRow[][]=[];
    let part:H2AutoStatusRow[]=[];
    for(const entry of ordered){
      if(part.length>0 && (entry.status===initialStatus || entry.status==="recebido")){
        chronological.push(part);part=[];
      }
      part.push(entry);
    }
    if(part.length)chronological.push(part);
    let lastProduct="";
    let lastOption="";
    const detailed=chronological.map(sub=>{
      const service=sub.find(v=>present(v.serviceName))||sub.find(v=>present(v.serviceOption));
      if(service&&present(service.serviceName))lastProduct=service.serviceName;
      if(service&&present(service.serviceOption))lastOption=service.serviceOption;
      const latest=sub[sub.length-1];
      const numbered=sub.find(v=>v.orderNumber!=null);
      return {registrationId,subOrderIndex:0,orderNumber:numbered?.orderNumber==null?null:Number(numbered.orderNumber),
        serviceName:lastProduct,serviceOption:lastOption,
        status:latest.status,statusLabel:present(latest.statusLabel)?latest.statusLabel:latest.status,
        updatedAt:latest.createdAt};
    }).reverse();
    detailed.forEach((item,subOrderIndex)=>{
      if(hiddenSet.has(registrationId+":"+subOrderIndex))return;
      if(result.length<maxOrders)result.push({...item,subOrderIndex});
    });
    if(result.length>=maxOrders)break;
  }
  return result;
}
