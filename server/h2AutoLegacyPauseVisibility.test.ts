import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const remote=read("./h2-auto-remote.ts");
const admin=read("../client/src/pages/AdminH2Auto.tsx");
const controls=read("../client/src/components/H2AutoManualControls.tsx");
const silenced=read("./h2-auto-silenced-contacts.ts");
describe("H2 Auto unified pause control and legacy visibility",()=>{
  it("shows old name blocks inside the same unified ADM center",()=>{
    expect(remote).toContain("legacyNames:legacySilencedEntries(cfg.blocked)");
    expect(controls).toContain("Bloqueios antigos por nome — revisão necessária");
    expect(controls).toContain("releaseLegacySilencedContact.useMutation");
    expect(remote).toContain("releaseLegacySilencedEntry(cfg.blocked,input.legacyEntry)");
  });
  it("keeps one ADM component and one canonical mutation without touching OTP",()=>{
    expect(admin).toContain("<H2AutoManualControls");
    expect(admin).not.toContain("<H2AutoSilencedContacts");
    expect(controls).toContain("setUnifiedPause.useMutation");
    expect(remote).toContain("pauseSync: saved.pauseSync");
    expect(remote).toContain("blocked: saved.blocked");
    expect(silenced).toContain("releaseLegacySilencedEntry");
  });
});
