import {describe,it,expect} from "vitest";
import {mergeRepeatedNameWithCpf} from "./h2bicoScreenshotPersonLink";
const base={crop:{x:24,y:20,size:140},confidence:95,warnings:[],photoLayout:"above" as const};
describe("H2BICO reunifica foto nome CPF",()=>{
 it("une legenda da foto e CPF encontrado na seção inferior",()=>{
 const a={...base,name:"RODRIGO DE SOUZA",cpf:"",nameBox:{left:260,top:580,width:230,height:21}};
 const b={...base,name:"RODRIGO DE SOUZA",cpf:"52998224725",nameBox:{left:400,top:920,width:230,height:21},cpfBox:{left:400,top:969,width:130,height:21}};
 const result=mergeRepeatedNameWithCpf([a,b]);expect(result).toHaveLength(1);
 expect(result[0].cpf).toBe("52998224725");expect(result[0].cpfBox).toEqual(b.cpfBox);
 expect(result[0].nameBox).toEqual(a.nameBox);expect(result[0].linkedAcrossSections).toBe(true);
 });
 it("não vincula nomes diferentes",()=>{
 const a={...base,name:"RODRIGO DE SOUZA",cpf:"",nameBox:{left:220,top:570,width:190,height:21}};
 const b={...base,name:"PEDRO DE SOUZA",cpf:"52998224725",nameBox:{left:200,top:940,width:190,height:21},cpfBox:{left:200,top:982,width:120,height:20}};
 expect(mergeRepeatedNameWithCpf([a,b])).toHaveLength(2);
 });
 it("não junta dois CPFs nem repetições ambíguas",()=>{
 const a={...base,name:"RODRIGO DE SOUZA",cpf:"52998224725",nameBox:{left:200,top:100,width:200,height:20}};
 const b={...base,name:"RODRIGO DE SOUZA",cpf:"11144477735",nameBox:{left:200,top:340,width:200,height:20},cpfBox:{left:200,top:370,width:130,height:20}};
 expect(mergeRepeatedNameWithCpf([a,b])).toHaveLength(2);
 expect(mergeRepeatedNameWithCpf([a,{...a,cpf:""},{...b,cpf:""}])).toHaveLength(3);
 });
});
