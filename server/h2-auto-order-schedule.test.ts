import {describe,it,expect} from "vitest";
import {attachScheduleToOrders} from "./h2-auto-order-schedule";
const orders=[{registrationId:10,subOrderIndex:0},{registrationId:10,subOrderIndex:1}];
const ap=(id:number,subOrderIndex:number,status:string,phone="11999999999")=>({id,registrationId:10,subOrderIndex,status,token:"a".repeat(32),customerPhone:phone,slotDate:"2026-10-27",slotTime:"14:30"});
const texts={pending:"Agende a foto",confirmed:"Foto confirmada"};
describe("H2 AUTO photo booking",()=>{
 it("returns correct link only for a verified order and phone",()=>{
  const x=attachScheduleToOrders(orders,[ap(7,1,"pending")],"11999999999",texts);
  expect(x[0].schedule).toBeNull();expect(x[1].schedule?.status).toBe("pending");expect(x[1].schedule?.url).toBe("https://h2colombiano.com/agendar/"+"a".repeat(32));
 });
 it("shows date/time only for a confirmed appointment",()=>{
  const x=attachScheduleToOrders(orders,[ap(8,0,"confirmed")],"11999999999",texts);
  expect(x[0].schedule?.slotTime).toBe("14:30");expect(x[1].schedule).toBeNull();
 });
 it("does not leak a link to a mismatched phone or another suborder",()=>{
  expect(attachScheduleToOrders(orders,[ap(8,0,"pending","11988888888")],"11999999999",texts)[0].schedule).toBeNull();
 });
 it("does not resurrect an old appointment if newest is cancelled",()=>{
  expect(attachScheduleToOrders(orders,[ap(2,0,"pending"),ap(3,0,"cancelled")],"11999999999",texts)[0].schedule).toBeNull();
 });
});