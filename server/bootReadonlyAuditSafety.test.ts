import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const boot = readFileSync(new URL("../scripts/render-start.sh", import.meta.url), "utf8");
const server = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const audit = readFileSync(new URL("../scripts/audit-customer-profile-integrity.ts", import.meta.url), "utf8");

describe("Render startup read-only profile diagnostic is nonblocking", () => {
  it("retains all required financial and database boot steps", () => {
    expect(boot).toContain('run_boot_step "db-migrate-status-scope"');
    expect(boot).toContain('run_boot_step "loans-recovery-preflight"');
    expect(boot).toContain('run_boot_step "loans-recovery-wrapper"');
    expect(boot).toContain('run_boot_step "loans-recovery-20260822-fix"');
    expect(boot).toContain('run_boot_step "db-migrate-third-party-phone-20261020"');
    expect(boot).toContain('exec node dist/index.js');
  });

  it("launches only the existing audit after the server binds", () => {
    expect(boot).not.toContain('run_boot_step "audit-customer-profile-integrity"');
    const listen = server.indexOf('server.listen(port, "0.0.0.0", () => {');
    const auditStart = server.indexOf('spawn("pnpm", ["exec", "tsx", "scripts/audit-customer-profile-integrity.ts"]');
    expect(listen).toBeGreaterThan(0);
    expect(auditStart).toBeGreaterThan(listen);
    expect(server).toContain('child.on("error"');
    expect(server).toContain('child.on("close"');
    expect(server).toContain('auditDelay.unref?.()');
  });

  it("keeps the diagnostic strictly read-only", () => {
    expect(audit).toContain('SELECT id, customerNumber, name, profilePhotoUrl');
    expect(audit).toContain('COMPLETE read_only=true');
    expect(audit).not.toMatch(/\b(UPDATE|DELETE|INSERT)\s+(?:INTO|FROM|customers)/i);
  });
});
