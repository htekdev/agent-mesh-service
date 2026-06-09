import assert from "node:assert";
import { describe, it } from "node:test";
import { canCreateMesh, canRegisterAgent } from "./planLimits.js";

describe("planLimits", () => {
  it("always allows mesh creation -- no limits", () => {
    assert.strictEqual(canCreateMesh({}, 0), true);
    assert.strictEqual(canCreateMesh({}, 999), true);
    assert.strictEqual(canCreateMesh(null, 10000), true);
  });

  it("always allows agent registration -- no limits", () => {
    assert.strictEqual(canRegisterAgent({}, 0), true);
    assert.strictEqual(canRegisterAgent({}, 10), true);
    assert.strictEqual(canRegisterAgent(null, 99999), true);
  });
});
