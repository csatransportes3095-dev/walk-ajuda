import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {h2AutoDiagnosticsSchema} from "./h2-auto-diagnostics";

const adm=readFileSync("client/src/pages/AdminH2Auto.tsx","utf8");
const minimal={
  apkVersion:"2.08-otp-continuity",apkVersionCode:108,
  mediaEnabled:true,transcribeConfigured:true,recordAudioPermission:true,listenerConnected:true,
  statusCode:"NOT_CHECKED",statusAt:0,androidErrorCode:-1,
  replyStatusCode:"NOT_CHECKED",replyStatusAt:0,
};
describe("H2 AUTO 2.08: diagnóstico do monitor independente de códigos",()=>{
  it("recebe sinais de consulta sem mensagens, senhas ou destinatários",()=>{
    const result=h2AutoDiagnosticsSchema.parse({...minimal,
      otpPollLastSuccessAt:1794800000000,otpPollLastFailureAt:0,
      otpMonitorRunning:true,otpMonitorHeartbeatAt:1794800000000,
      otpMonitorStartFailedAt:0});
    expect(result.otpMonitorRunning).toBe(true);
    expect(result.otpPollLastSuccessAt).toBe(1794800000000);
  });
  it("APK 2.07 e versões anteriores continuam aceitos",()=>{
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,apkVersion:"2.07-local-pause-release",apkVersionCode:107}).success).toBe(true);
  });
  it("bloqueia conteúdo pessoal, códigos e formatos incorretos",()=>{
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,otpMonitorRunning:"true"}).success).toBe(false);
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,otpPollLastSuccessAt:-1}).success).toBe(false);
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,otpCode:"123456"}).success).toBe(false);
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,whatsappNumber:"11999999999"}).success).toBe(false);
  });
  it("ADM alerta sobre silêncio do processo mesmo se o listener ainda aparece conectado",()=>{
    expect(adm).toContain("h2-auto-otp-continuity");
    expect(adm).toContain("SEM CONSULTA RECENTE");
    expect(adm).toContain("otpPollLastSuccessAt");
    expect(adm).toContain("otpMonitorStartFailedAt");
    expect(adm).toContain("Consulta ativa não comprova");
  });
});