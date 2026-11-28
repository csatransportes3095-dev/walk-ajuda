import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildValidraItemRequirements,validateValidraItemForm } from "./validraCartForms";
import { assembleValidraCartForms } from "./validraCartPublic";
const product={id:1,name:"Servico",requireVehicle2016:0,isPdfOnly:0,showYearField:0};
const option={id:11,productId:1,label:"Opcao",type:"standard",requireProfilePhoto:0,requireCarDocument:0,requireAlvara:0,requireCondutaxi:0,requireVehicle2016:0,isPdfOnly:0,showYearField:0,docNameMode:"none",commissionValue:0};
const first={id:1,question:"Tipo de cadastro",fieldType:"select" as const,options:JSON.stringify(["Sim","Nao",{label:"Bloqueado",blocking:true}]),isRequired:1,sortOrder:0,parentQuestionId:null,triggerOption:null,questionPresentation:"text"};
const child={...first,id:2,question:"Detalhes",fieldType:"text" as const,options:null,sortOrder:1,parentQuestionId:1,triggerOption:"Sim"};
const doc={id:4,label:"Identidade",inputSource:"both" as const,sortOrder:0};
describe("Public Validra cart forms",()=>{
  it("validates required answers, visible descendants and canonical labels",()=>{
    const spec=buildValidraItemRequirements(product,option,[first,child],[doc]);
    const documents=[{fieldId:"dynamic:4",fileKey:"order-docs/first.pdf"}];
    expect(()=>validateValidraItemForm(spec,{answers:[{questionId:1,answer:"Sim"}],documents})).toThrow("validra_cart_form_invalid");
    expect(()=>validateValidraItemForm(spec,{answers:[{questionId:1,answer:"Nao"},{questionId:2,answer:"hidden"}],documents})).toThrow("validra_cart_form_invalid");
    expect(()=>validateValidraItemForm(spec,{answers:[{questionId:1,answer:"Bloqueado"}],documents})).toThrow("validra_cart_form_invalid");
    expect(()=>validateValidraItemForm(spec,{answers:[{questionId:1,answer:"Nao"}],documents:[]})).toThrow("validra_cart_form_invalid");
    const result=validateValidraItemForm(spec,{answers:[{questionId:1,answer:"sim"},{questionId:2,answer:"A"}],documents});
    expect(JSON.parse(result.answers)).toMatchObject([{questionId:1,question:"Tipo de cadastro",answer:"Sim",depth:0},{questionId:2,question:"Detalhes",answer:"A",depth:1}]);
  });
  it("separates repeated options by array position and refuses a missing or duplicate document",async()=>{
    const spec=buildValidraItemRequirements(product,option,[first],[]);
    const forms=await assembleValidraCartForms([spec,spec],[{answers:[{questionId:1,answer:"Sim"}],documents:[]},{answers:[{questionId:1,answer:"Nao"}],documents:[]}],{customerId:21,phone:"11999990000"},"fixture");
    expect(forms.map(form=>JSON.parse(form.answers)[0].answer)).toEqual(["Sim","Nao"]);
    await expect(assembleValidraCartForms([spec,spec],[{answers:[{questionId:1,answer:"Sim"}],documents:[]}],{customerId:21,phone:"11999990000"},"fixture")).rejects.toThrow("validra_cart_form_invalid");
    const docSpec=buildValidraItemRequirements(product,option,[],[doc]);
    const same={answers:[],documents:[{fieldId:"dynamic:4",fileKey:"order-docs/same.pdf"}]};
    await expect(assembleValidraCartForms([docSpec,docSpec],[same,same],{customerId:21,phone:"11999990000"},"fixture")).rejects.toThrow("validra_cart_form_invalid");
  });
  it("enforces ADM blocking rules and refuses unsupported advanced requirements",()=>{
    const spec=buildValidraItemRequirements(product,option,[first],[],[{questionId:1,answer:"Sim"}]);
    expect(()=>validateValidraItemForm(spec,{answers:[{questionId:1,answer:"Sim"}],documents:[]})).toThrow("validra_cart_form_invalid");
    for(const key of ["requireVehicle2016","showYearField"] as const)expect(()=>buildValidraItemRequirements(product,{...option,[key]:1},[],[])).toThrow("validra_cart_requirements_not_ready");
    expect(()=>buildValidraItemRequirements(product,{...option,docNameMode:"custom"},[],[])).toThrow("validra_cart_requirements_not_ready");
    expect(()=>buildValidraItemRequirements(product,option,[{...first,fieldType:"audio"}],[])).toThrow("validra_cart_requirements_not_ready");
    expect(()=>buildValidraItemRequirements(product,option,[{...first,options:'[{"label":"Ir","flowAction":"jump","flowTarget":999}]'}],[])).toThrow("validra_cart_requirements_not_ready");
    expect(buildValidraItemRequirements(product,{...option,isPdfOnly:1},[],[]).documents).toMatchObject([{fieldId:"legacy:pdf",pdfOnly:true}]);
  });
  it("applies jump, finish and message per position without accepting hidden answers",()=>{
    const root={...first,options:JSON.stringify([{label:"Pular",flowAction:"jump",flowTarget:3},{label:"Fim",flowAction:"finish"},{label:"Aviso",flowAction:"message",flowMessage:"Concluído"},"Normal"])};
    const middle={...child,id:2,parentQuestionId:null,triggerOption:null};
    const last={...middle,id:3,sortOrder:2};
    const spec=buildValidraItemRequirements(product,option,[root,middle,last],[]);
    const input=(answers:{questionId:number;answer:string}[])=>({answers,documents:[]});
    expect(JSON.parse(validateValidraItemForm(spec,input([{questionId:1,answer:"Pular"},{questionId:3,answer:"Final"}])).answers).map((x:{questionId:number})=>x.questionId)).toEqual([1,3]);
    expect(()=>validateValidraItemForm(spec,input([{questionId:1,answer:"Pular"},{questionId:2,answer:"Oculto"},{questionId:3,answer:"Final"}]))).toThrow("validra_cart_form_invalid");
    for(const answer of ["Fim","Aviso"])expect(JSON.parse(validateValidraItemForm(spec,input([{questionId:1,answer}])).answers)).toHaveLength(1);
    expect(()=>validateValidraItemForm(spec,input([{questionId:1,answer:"Normal"}]))).toThrow("validra_cart_form_invalid");
  });
  it("keeps release gate before customer and provider calls and uses a separate cart mutation",()=>{
    const router=readFileSync("server/routers.ts","utf8").split("checkoutValidraCart: publicProcedure")[1].split("submitFiles: publicProcedure")[0];
    expect(router.indexOf("if(!VALIDRA_CHECKOUT_READY)")).toBeLessThan(router.indexOf("requireCustomerSession(input.cpToken,input.phone)"));
    expect(router).toContain("checkoutPublicValidraCart");
    const home=readFileSync("client/src/pages/Home.tsx","utf8");
    expect(home.indexOf("if(usingValidraCartCheckout){")).toBeLessThan(home.indexOf("const cartItems = cart.length > 1 ? cart : null"));
    expect(home).toContain("validraCartMutation.mutateAsync");
    expect(home).toContain("forms:savedValidraCartAttempt?undefined:validraCartForms?.forms");
    expect(readFileSync("client/src/components/ValidraCartForms.tsx","utf8")).toContain("prev[index]");
    expect(readFileSync("server/checkoutPaymentProvider.ts","utf8")).toContain("VALIDRA_CHECKOUT_READY = false");
  });
});
