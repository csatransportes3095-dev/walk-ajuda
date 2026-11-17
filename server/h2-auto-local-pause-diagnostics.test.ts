import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {h2AutoDiagnosticsSchema} from "./h2-auto-diagnostics";
const adm=readFileSync("client/src/pages/AdminH2Auto.tsx","utf8");
const controls=readFileSync("client/src/components/H2AutoManualControls.tsx","utf8");
const schema=readFileSync("server/h2-auto-diagnostics.ts","utf8");
const remote=readFileSync("server/h2-auto-remote.ts","utf8");
const minimal={
  apkVersion:"2.11-unified-pause-state",apkVersionCode:111,
  mediaEnabled:true,transcribeConfigured:true,recordAudioPermission:true,listenerConnected:true,
  statusCode:"NOT_CHECKED",statusAt:0,androidErrorCode:-1,
  replyStatusCode:"NOT_CHECKED",replyStatusAt:0,
};
describe("ADM H2 AUTO unified pause diagnostics",()=>{
  it("accepts aggregate counts and exact sync receipt",()=>{
    const result=h2AutoDiagnosticsSchema.parse({...minimal,
      localPauseActiveRecords:3,localPauseTemporaryRecords:2,localPausePermanentRecords:1,
      localPauseLastSyncId:"f".repeat(32)});
    expect(result.localPauseActiveRecords).toBe(3);
    expect(result.localPauseLastSyncId).toBe("f".repeat(32));
  });
  it("keeps older APKs backward compatible without accepting arbitrary phone fields",()=>{
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,apkVersion:"2.05",apkVersionCode:105}).success).toBe(true);
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,phone:"11999999999"}).success).toBe(false);
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,localPauseLastSyncId:"bad"}).success).toBe(false);
    expect(schema).toContain(".strict()");
  });
  it("keeps opaque local records without exposing hashed keys",()=>{
    const entries=[{id:"a".repeat(32),name:"",identitySource:"unknown",mode:"permanent",origin:"operator",until:0}];
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,localPauseEntries:entries}).success).toBe(true);
    expect(h2AutoDiagnosticsSchema.safeParse({...minimal,localPauseEntries:[{...entries[0],key:"manual_handoff_a"}]}).success).toBe(false);
  });
  it("shows one pause center with explicit recovery and pending APK sync",()=>{
    expect(adm).toContain("<H2AutoManualControls");
    expect(remote).toContain("releaseLocalPause: adminProcedure");
    expect(controls).toContain("releaseLocalPause.useMutation");
    expect(controls).toContain("localPauseLastSyncId");
    expect(controls).toContain("Limpeza das pausas locais ainda não confirmada");
    expect(controls).toContain("window.confirm");
    expect(remote).toContain("setUnifiedPause: adminProcedure");
  });
  it("retains authenticated APK diagnostic ACK and independent security blocks",()=>{
    expect(remote).toContain("diagnostics: h2AutoDiagnosticsSchema.optional()");
    expect(controls).toContain("Pausas locais do APK");
    expect(controls).toContain("Bloqueios antigos por nome");
    expect(adm).toContain("<H2AutoValidationBlocks");
  });
});
