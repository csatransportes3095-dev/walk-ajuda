import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const remote=read("./h2-auto-remote.ts");
const admin=read("../client/src/pages/AdminH2Auto.tsx");
const panel=read("../client/src/components/H2AutoSilencedContacts.tsx");
const controls=read("../client/src/components/H2AutoManualControls.tsx");
const silenced=read("./h2-auto-silenced-contacts.ts");
describe("H2 Auto hidden legacy blocks and pause controls",()=>{
  it("shows both stored phone and name blocks in the ADM",()=>{
    expect(remote).toContain("legacyNames:legacySilencedEntries(cfg.blocked)");
    expect(panel).toContain("BLOQUEIOS ANTIGOS POR NOME");
    expect(panel).toContain("releaseLegacySilencedContact.useMutation");
    expect(remote).toContain("releaseLegacySilencedEntry(cfg.blocked,input.legacyEntry)");
  });
  it("restores existing ADM pause controls without touching incoming OTP",()=>{
    expect(admin).toContain('<H2AutoManualControls deviceId={d.id} deviceLabel={d.label} />');
    expect(controls).toContain("setManualControl.useMutation");
    expect(remote).toContain("blocked: saved.blocked");
    expect(silenced).toContain("releaseLegacySilencedEntry");
  });
});
