import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isH2AdsProxyUnusedForDeletion } from "./h2adsProxyPool";

const read=(path:string)=>readFileSync(new URL(path, import.meta.url), "utf8");
const pool=read("./h2adsProxyPool.ts");
const router=read("./routers/h2ads.ts");
const ui=read("../client/src/pages/H2Ads.tsx");

describe("H2 ADS: exclusão segura de proxies sem uso",()=>{
  const linked=new Set(["proxy-ativo"]);
  it("nunca exclui uma proxy atribuída, mesmo que não tenha credencial cadastrada",()=>{
    expect(isH2AdsProxyUnusedForDeletion({status:"assigned",fingerprint:"outro"},new Set())).toBe(false);
    expect(isH2AdsProxyUnusedForDeletion({status:"assigned",fingerprint:"proxy-ativo"},linked)).toBe(false);
  });
  it("protege uma rota ainda cadastrada em instância, independentemente do status da fila",()=>{
    for(const status of ["used","failed","disabled","available","assigned"]){
      expect(isH2AdsProxyUnusedForDeletion({status,fingerprint:"proxy-ativo"},linked)).toBe(false);
    }
  });
  it("permite limpar fila sem vínculo e preserva estados desconhecidos",()=>{
    for(const status of ["used","failed","disabled","available"]){
      expect(isH2AdsProxyUnusedForDeletion({status,fingerprint:"livre"},linked)).toBe(true);
    }
    for(const status of ["assigned","running",""]){
      expect(isH2AdsProxyUnusedForDeletion({status,fingerprint:"livre"},linked)).toBe(false);
    }
  });
  it("usa transação e bloqueio contra concorrência com reserva",()=>{
    expect(pool).toContain("return db.transaction(async tx =>");
    expect(pool).toContain("FOR UPDATE");
    expect(pool).toContain("h2AdsInstanceProxyCredentials.encryptedPayload");
    expect(pool).toContain("proxyFingerprint(decryptH2AdsProxy(credential.encryptedPayload))");
    expect(pool).toContain("inArray(h2AdsProxyPool.status, [...H2ADS_POOL_CLEANUP_STATUSES])");
    expect(pool).not.toContain("console.log(credentials)");
  });
  it("exige ADM, confirmação visível e não exibe credenciais de proxy",()=>{
    expect(router).toContain("deleteUnusedProxyPool: adminProcedure.mutation");
    expect(ui).toContain("trpc.h2Ads.deleteUnusedProxyPool.useMutation()");
    expect(ui).toContain("EXCLUIR NÃO USADAS");
    expect(ui).toContain("window.confirm(");
    expect(ui).toContain("As proxies atribuídas ou ainda configuradas em alguma instância serão preservadas");
  });
});
