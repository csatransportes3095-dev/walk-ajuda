/** Present only active appointments belonging to a verified order and phone. */
export type H2AutoOrderReference = {registrationId:number;subOrderIndex:number;[key:string]:unknown};
export type H2AutoAppointmentRow = {
 id:number;registrationId:number;subOrderIndex:number;token:string;status:string;
 customerPhone:string;slotDate:string|null;slotTime:string|null;
};
export type H2AutoScheduleInfo = {
 status:"pending"|"confirmed";url:string;slotDate:string|null;slotTime:string|null;message:string;
};
const normalizedPhone=(value:unknown):string=>{
 let d=String(value??"").replace(/\D/g,"");
 if((d.length===12||d.length===13)&&d.startsWith("55"))d=d.slice(2);
 return /^\d{10,11}$/.test(d)?d:"";
};
const tokenPattern=/^[-_A-Za-z0-9]{32,64}$/;
const validDay=(d:unknown):d is string=>typeof d==="string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
const validHour=(h:unknown):h is string=>typeof h==="string" && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(h);
/** A newer cancelled/completed record prevents reusing an older booking link. */
export function attachScheduleToOrders<T extends H2AutoOrderReference>(
 orders:readonly T[],appointments:readonly H2AutoAppointmentRow[],verifiedPhone:string,
 text:{pending:string;confirmed:string},
):Array<T&{schedule:H2AutoScheduleInfo|null}> {
 const phone=normalizedPhone(verifiedPhone);
 const latest=new Map<string,H2AutoAppointmentRow>();
 for(const appt of [...appointments].sort((a,b)=>Number(b.id)-Number(a.id))){
  if(!Number.isSafeInteger(Number(appt.id))||Number(appt.id)<1)continue;
  if(!Number.isSafeInteger(Number(appt.registrationId))||Number(appt.registrationId)<1)continue;
  const sub=Number(appt.subOrderIndex);
  if(!Number.isInteger(sub)||sub<0)continue;
  const key=appt.registrationId+":"+sub;
  if(!latest.has(key))latest.set(key,appt);
 }
 return orders.map(order=>{
  const appt=latest.get(order.registrationId+":"+order.subOrderIndex);
  if(!appt||!phone||normalizedPhone(appt.customerPhone)!==phone||
    !tokenPattern.test(String(appt.token??"")) ||
    (appt.status!=="pending"&&appt.status!=="confirmed"))return {...order,schedule:null};
  return {...order,schedule:{
   status:appt.status,
   url:"https://h2colombiano.com/agendar/"+appt.token,
   slotDate:appt.status==="confirmed"&&validDay(appt.slotDate)?appt.slotDate:null,
   slotTime:appt.status==="confirmed"&&validHour(appt.slotTime)?appt.slotTime:null,
   message:appt.status==="confirmed"?text.confirmed:text.pending,
  }};
 });
}
