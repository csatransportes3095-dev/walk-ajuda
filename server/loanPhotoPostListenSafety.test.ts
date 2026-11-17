import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const boot = readFileSync(new URL("../scripts/render-start.sh", import.meta.url), "utf8");
const server = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const loanRepair = readFileSync(new URL("../scripts/apply-loans-recovery-20260822-fix.ts", import.meta.url), "utf8");

describe("loan recovery before HTTP is financial-only; old photo search is isolated", () => {
  it("retains the financial recovery boot step and all other loan prerequisites", () => {
    expect(boot).toContain('run_boot_step "loans-recovery-preflight"');
    expect(boot).toContain('run_boot_step "loans-recovery-wrapper"');
    expect(boot).toContain('run_boot_step "loans-recovery-20260822-fix" pnpm exec tsx scripts/apply-loans-recovery-20260822-fix.ts --financial-only');
    expect(boot).toContain('run_boot_step "ensure-diamond-loan-profile"');
    expect(boot).toContain('exec node dist/index.js');
  });
  it("does not run the optional R2 photo search until after HTTP listening", () => {
    const listen = server.indexOf('server.listen(port, "0.0.0.0", () => {');
    const photo = server.indexOf('"--photos-only"');
    expect(listen).toBeGreaterThan(0);
    expect(photo).toBeGreaterThan(listen);
    expect(server).toContain("60_000");
    expect(server).toContain('child.on("error"');
    expect(server).toContain('child.on("close"');
    expect(server).toContain("photoRepairDelay.unref?.()");
  });
  it("keeps financial repair available, and runs only photo phase when requested", () => {
    expect(loanRepair).toContain('if (!photosOnly) await repairFinancialState(db)');
    expect(loanRepair).toContain('if (!financialOnly) {');
    expect(loanRepair).toContain('"--financial-only", "--photos-only"');
    expect(loanRepair).toContain('await repairLoanCustomerPhotos(db)');
    expect(loanRepair).toContain('photoLockAcquired = Number(lockRows?.[0]?.acquired) === 1');
    expect(loanRepair).toContain('SELECT RELEASE_LOCK(?) AS released');
  });
  it("prevents a delayed R2 repair from overwriting a new customer photo", () => {
    expect(loanRepair).toContain("profilePhotoUrl <=> ?");
    expect(loanRepair).toContain("AND deletedAt IS NULL");
    expect(loanRepair).toContain('skippedConcurrentUpdates');
  });
});
