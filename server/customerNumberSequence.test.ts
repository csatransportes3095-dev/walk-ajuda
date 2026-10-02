import { describe, expect, it } from "vitest";
import {
  CUSTOMER_NUMBER_SEQUENCE_START,
  RESERVED_CUSTOMER_NUMBER,
  pickNextCustomerNumber,
} from "./customerNumberSequence";

describe("customerNumberSequence", () => {
  it("starts at the official sequence base", () => {
    expect(pickNextCustomerNumber([])).toBe(CUSTOMER_NUMBER_SEQUENCE_START);
  });

  it("returns the first free number in the official sequence", () => {
    expect(
      pickNextCustomerNumber([
        { customerNumber: 470 },
        { customerNumber: 471 },
        { customerNumber: 472 },
        { customerNumber: 474 },
      ]),
    ).toBe(473);
  });

  it("does not let a manual high number push the official sequence", () => {
    expect(
      pickNextCustomerNumber([
        { customerNumber: 470 },
        { customerNumber: 471 },
        { customerNumber: 9974 },
        { customerNumber: RESERVED_CUSTOMER_NUMBER },
      ]),
    ).toBe(472);
  });

  it("keeps sequential behavior with numeric strings returned by MySQL", () => {
    expect(
      pickNextCustomerNumber([
        { customerNumber: "470" },
        { customerNumber: "471" },
        { customerNumber: "472" },
      ]),
    ).toBe(473);
  });
});
