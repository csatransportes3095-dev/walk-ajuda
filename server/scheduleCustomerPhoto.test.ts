import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("foto do cliente no ADM de agendamentos", () => {
  it("usa a foto atual do cadastro quando o snapshot do agendamento estiver vazio", () => {
    const db = read("server/db.ts");
    expect(db).toContain("customerProfilePhotoUrl: customers.profilePhotoUrl");
    expect(db).toContain('snapshotPhoto.toUpperCase() === "NULL"');
    expect(db).toContain("appt.customerPhotoUrl = profilePhoto");
  });

  it("grava a foto do cadastro nos novos agendamentos automaticos e recriados", () => {
    const auto = read("server/autoSchedule.ts");
    expect(auto).toContain("customerPhotoUrl = customer?.profilePhotoUrl || null");
    const createCallsWithPhoto = auto.match(/createAppointment\(\{[\s\S]*?customerPhotoUrl,[\s\S]*?templateId: null,[\s\S]*?\}\);/g) || [];
    expect(createCallsWithPhoto.length).toBeGreaterThanOrEqual(2);
  });
});
