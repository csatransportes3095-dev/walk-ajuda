import { describe,expect,it } from "vitest";
import { attachSiteAccessProfilePhotos,safeSiteAccessPhotoUrl } from "./siteSecurityProfilePhotos";
const customer=(id:number,email:string|null,url:string|null,deletedAt:Date|null=null)=>({id,email,profilePhotoUrl:url,deletedAt});
describe("Fotos das pessoas autorizadas",()=>{
 it("prioriza vínculo exato e associa e-mail somente quando único",()=>{
  const entries=[{email:"a@teste.com",customerId:1},{email:" b@teste.com ",customerId:null},{email:"d@teste.com",customerId:null}];
  const result=attachSiteAccessProfilePhotos(entries,[customer(1,"a@teste.com","https://img.test/a.jpg"),customer(2,"B@TESTE.COM","https://img.test/b.jpg"),customer(3,"d@teste.com","https://img.test/3.jpg"),customer(4,"d@teste.com","https://img.test/4.jpg")]);
  expect(result.map(x=>x.profilePhotoUrl)).toEqual(["https://img.test/a.jpg","https://img.test/b.jpg",null]);
 });
 it("não confunde IDs removidos nem atribui outra foto pelo e-mail",()=>{
  const result=attachSiteAccessProfilePhotos([{email:"mesmo@teste.com",customerId:99}], [customer(1,"mesmo@teste.com","https://img.test/1.jpg")]);
  expect(result[0].profilePhotoUrl).toBeNull();
 });
 it("ignora clientes deletados e URLs inseguras",()=>{
  expect(attachSiteAccessProfilePhotos([{email:"x@teste.com",customerId:null}],[customer(1,"x@teste.com","https://img.test/x.jpg",new Date())])[0].profilePhotoUrl).toBeNull();
  expect(safeSiteAccessPhotoUrl("javascript:alert(1)")).toBeNull();
  expect(safeSiteAccessPhotoUrl("//evil.test/x")).toBeNull();
  expect(safeSiteAccessPhotoUrl("/profile/x.jpg")).toBe("/profile/x.jpg");
 });
});