import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {safeH2AutoUnknownQuestion} from "./h2-auto-learning";

const remote=readFileSync(new URL("./h2-auto-remote.ts",import.meta.url),"utf8");
const learning=readFileSync(new URL("./h2-auto-learning.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../client/src/pages/AdminH2Auto.tsx",import.meta.url),"utf8");

describe("H2 AUTO 2.12 authenticated unanswered-question bridge",()=>{
  it("only paired APK with operator collection enabled can submit",()=>{
    expect(remote).toContain('"/api/h2-auto/learning/unknown"');
    expect(remote).toContain("matchesHash(device.token_hash,token)");
    expect(remote).toContain("if(!cfg.questionCollectionEnabled)");
    expect(remote).toContain("recordH2AutoUnknownQuestion(id,payload.data.question,payload.data.eventId)");
    expect(remote).toContain("z.string().regex(/^[a-f0-9]{64}$/)");
  });
  it("enforces exact event idempotence in one transaction",()=>{
    expect(learning).toContain("h2_auto_unanswered_events");
    expect(learning).toContain("INSERT IGNORE INTO h2_auto_unanswered_events");
    expect(learning).toContain("if (!inserted[0]?.affectedRows) return false");
    expect(learning).toContain("(db as any).transaction(async (tx: any)");
  });
  it("rejects private identifiers even with service 99, greetings and commands",()=>{
    for(const q of ["11999999999","Meu CPF 12345678901 faz 99?","MENU","/H2","Minha senha é 123456?","Qual é o código 555666?"]){
      expect(safeH2AutoUnknownQuestion(q)).toBeNull();
    }
    for(const q of ["Quanto custa um pedido?","Como faço para marcar a foto?","Faz conta 99?"]){
      expect(safeH2AutoUnknownQuestion(q)).not.toBeNull();
    }
  });
  it("shows explicit disabled and pending sync states instead of false collection success",()=>{
    expect(ui).toContain("Coleta DESATIVADA");
    expect(ui).toContain("O APK ainda não confirmou");
    expect(ui).toContain("Atualize o APK para 2.12");
    expect(ui).toContain("questionCollectionEnabled");
  });
});
