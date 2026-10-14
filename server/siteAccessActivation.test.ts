import { describe, expect, it } from "vitest";
import { modeActivationFailure } from "./siteAccessActivation";

const ready = {enforced: true, ownerPresent: true, secretLength: 64};
describe("mode activation conditions", () => {
  it("always allows owner to restore public mode", () => {
    expect(modeActivationFailure("public", {enforced:false,ownerPresent:false,secretLength:0})).toBeNull();
  });
  it("requires complete secure configuration to restrict or block", () => {
    for (const mode of ["restricted","blocked"] as const) {
      expect(modeActivationFailure(mode,ready)).toBeNull();
      expect(modeActivationFailure(mode,{...ready,enforced:false})).not.toBeNull();
      expect(modeActivationFailure(mode,{...ready,ownerPresent:false})).not.toBeNull();
      expect(modeActivationFailure(mode,{...ready,secretLength:31})).not.toBeNull();
    }
  });
});
