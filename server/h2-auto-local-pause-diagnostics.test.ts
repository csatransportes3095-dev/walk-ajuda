import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {h2AutoDiagnosticsSchema} from "./h2-auto-diagnostics";

const adm=readFileSync("client/src/pages/AdminH2Auto.tsx","utf8");
const schema=readFileSync("server/h2-auto-diagnostics.ts","utf8");
const remote=readFileSync("server/h2-auto-remote.ts","utf8");

const minimal={
  apkVersion:"2.06-local-pause-diagnostics",apkVersionCode:106,
  mediaEnabled:true,transcribeConfigured:true,recordAudioPermission:true,listenerConnected:true,
  statusCode:"NOT_CHECKED",statusAt:0,androidErrorCode:-1,
  replyStatusCode:"NOT_CHECKED",replyStatusAt:0,
};

describe("ADM H2 AUTO: contador de pausas locais em diagnostico",()=>{
  it("aceita os tres contadores sem identificar contatos",()=>{
    const result=h2AutoDiagnosticsSchema.parse({...minimal,
      localPauseActiveRecords:3,localPauseTemporaryRecords:2,localPausePermanentRecords:1});
    expect(result.localPauseActiveRecords).toBe(3);
    expect(result.localPauseTemporaryRecords).toBe(2);
    expect(result.localPausePermanentRecords).toBe(1);
  });
  it("aceita diagnósticos do APK antigo sem campos novos",()=>{
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,apkVersion:"2.05-legacy-phone-otp",apkVersionCode:105}).success).toBe(true);
  });
  it("rejeita contagem negativa ou dados de contato não previstos",()=>{
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,localPauseActiveRecords:-1}).success).toBe(false);
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,localPauseActiveRecords:1,phone:"11900000000"}).success).toBe(false);
    expect(schema).toContain(".strict()");
  });
  it("mantém envio via ACK autenticado existente e apenas mostra relatório",()=>{
    expect(remote).toContain("diagnostics: h2AutoDiagnosticsSchema.optional()");
    expect(adm).toContain("PAUSAS LOCAIS DO APK — SINCRONIZAÇÃO COM ADM");
    expect(adm).toContain("localPauseTemporaryRecords");
    expect(adm).toContain("localPausePermanentRecords");
    expect(adm).toContain("Ainda não informado pelo APK");
    expect(adm).toContain("Somente leitura");
  });
});
