import { describe,it,expect } from "vitest";
import {normalizeSilencedPhone,manualSilencedPhones,changeSilencedPhone} from "./h2-auto-silenced-contacts";

describe("H2 AUTO manual phone silencing",()=>{
  it("recognizes DDD, formatting and Brazil country code",()=>{
    expect(normalizeSilencedPhone("(11) 99999-9999")).toBe("11999999999");
    expect(normalizeSilencedPhone("+55 11 99999-9999")).toBe("11999999999");
    expect(normalizeSilencedPhone("11999999999")).toBe("11999999999");
  });
  it("rejects names and invalid phone-like sender strings",()=>{
    expect(normalizeSilencedPhone("933 Danilo")).toBeNull();
    expect(normalizeSilencedPhone("Contato 11999999999")).toBeNull();
    expect(normalizeSilencedPhone("111")).toBeNull();
  });
  it("blocks and releases one phone without touching legacy names or other numbers",()=>{
    let blocked="Cliente Antigo\n(11) 98888-8888";
    blocked=changeSilencedPhone(blocked,"+5511999999999","block");
    expect(manualSilencedPhones(blocked)).toEqual(["11988888888","11999999999"]);
    blocked=changeSilencedPhone(blocked,"11999999999","release");
    expect(blocked).toContain("Cliente Antigo");
    expect(manualSilencedPhones(blocked)).toEqual(["11988888888"]);
  });
  it("deduplicates and keeps other contacts isolated",()=>{
    expect(manualSilencedPhones("11999999999\n+5511999999999\n21988888888"))
      .toEqual(["11999999999","21988888888"]);
  });
});
