import { describe,expect,it } from "vitest";
import { inspectSiteSecurityBackup } from "./siteAccessBackupGate";
const id="a".repeat(48),hash="b".repeat(64);
const now=Date.parse("2026-10-13T20:00:00Z");
const valid=()=>({
  id,status:"completed",completedAt:new Date(now-3600000),
  artifactKey:"backups/safe.enc",fileSize:2048,archiveSha256:hash,
  manifestJson:JSON.stringify({remoteVerification:{status:"verified",bytes:2048,sha256:hash,verifiedAt:new Date(now-1800000).toISOString()}}),
});
describe("Production backup gate",()=>{
  it("accepts only verified recent exact backup",()=>expect(inspectSiteSecurityBackup(valid(),id,now)).toEqual([]));
  it("rejects incomplete backup",()=>expect(inspectSiteSecurityBackup({...valid(),status:"running"},id,now)).toContain("Backup não está concluído"));
  it("rejects old backup",()=>expect(inspectSiteSecurityBackup({...valid(),completedAt:new Date(now-48*3600000)},id,now)).toContain("Backup não foi concluído nas últimas 24 horas"));
  it("rejects incorrect hash",()=>expect(inspectSiteSecurityBackup({...valid(),archiveSha256:"c".repeat(64)},id,now)).toContain("SHA-256 da verificação remota não confere"));
  it("rejects incomplete verification",()=>expect(inspectSiteSecurityBackup({...valid(),manifestJson:JSON.stringify({remoteVerification:{status:"verifying"}})},id,now)).toContain("Integridade profunda do backup não verificada"));
});
