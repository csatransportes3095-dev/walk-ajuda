import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const remote=readFileSync(new URL("./h2-auto-remote.ts",import.meta.url),"utf8");
const admin=readFileSync(new URL("../client/src/pages/AdminH2Auto.tsx",import.meta.url),"utf8");
const controls=readFileSync(new URL("../client/src/components/H2AutoManualControls.tsx",import.meta.url),"utf8");

describe("H2 Auto single pause authority regression",()=>{
  it("uses exactly one ADM pause center and no legacy ineffective text field",()=>{
    expect(admin).toContain('data-testid');
    expect(admin).toContain("<H2AutoManualControls");
    expect(admin).not.toContain("<H2AutoSilencedContacts");
    expect(admin).not.toContain('onChange={e => change("blocked", e.target.value)}');
    expect(controls).toContain('data-testid="h2auto-single-pause-center"');
    expect(controls).toContain("setUnifiedPause.useMutation");
  });
  it("writes the same device revision for manualControls, old block cleanup and APK sync",()=>{
    expect(remote).toContain("async function writeUnifiedPause");
    expect(remote).toContain("'$.manualControls'");
    expect(remote).toContain("'$.blocked'");
    expect(remote).toContain("'$.pauseSync'");
    expect(remote).toContain("normalizeSilencedPhone(x)!==input.phone");
    expect(remote).toContain("revision=revision+1");
    expect(remote).toContain("WHERE id=${input.id} AND revision=${Number(data[0].revision)}");
    expect(remote).toContain("pauseSync: saved.pauseSync");
  });
  it("requires paired device authentication for Android-issued commands",()=>{
    expect(remote).toContain('"/api/h2-auto/pause-action"');
    expect(remote).toContain('x-h2-device-token');
    expect(remote).toContain("matchesHash(data[0].token_hash,token)");
    expect(remote).toContain("writeUnifiedPause(id,parsed.data.phone");
  });
  it("never confuses ADM pause with WhatsApp delivery or validation security block",()=>{
    expect(remote).toContain("releaseValidationBlock: adminProcedure");
    expect(remote).toContain("releaseAllValidationBlocks: adminProcedure");
    expect(remote).toContain("releaseLegacySilencedEntry(cfg.blocked,input.legacyEntry)");
    expect(controls).toContain("Bloqueios antigos por nome");
  });
});
