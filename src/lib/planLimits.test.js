import assert from "node:assert";
import { describe, it } from "node:test";
import {
  canCreateMesh,
  canRegisterAgent,
  FREE_PLAN_AGENT_LIMIT_MESSAGE,
  FREE_PLAN_MESH_LIMIT_MESSAGE,
} from "./planLimits.js";

describe("planLimits", () => {
  it("allows one mesh on free plan and blocks the second", () => {
    const freeUser = { plan: "free" };
    assert.strictEqual(canCreateMesh(freeUser, 0), true);
    assert.strictEqual(canCreateMesh(freeUser, 1), false);
    assert.ok(FREE_PLAN_MESH_LIMIT_MESSAGE.includes("Upgrade to Pro"));
  });

  it("allows more than one mesh on pro plan", () => {
    const proUser = { plan: "pro" };
    assert.strictEqual(canCreateMesh(proUser, 999), true);
  });

  it("blocks the eleventh agent on free plan", () => {
    const freeUser = { plan: "free" };
    assert.strictEqual(canRegisterAgent(freeUser, 9), true);
    assert.strictEqual(canRegisterAgent(freeUser, 10), false);
    assert.ok(FREE_PLAN_AGENT_LIMIT_MESSAGE.includes("10 agents"));
  });
});
