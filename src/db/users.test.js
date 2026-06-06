import assert from "node:assert";
import { describe, it } from "node:test";
import { generateToken, getMaskedToken, hashToken } from "./users.js";

describe("users token helpers", () => {
  it("generates MeshWire tokens with the mw_ prefix", () => {
    const { plainToken, tokenHash, tokenSuffix } = generateToken();

    assert.ok(plainToken.startsWith("mw_"));
    assert.strictEqual(plainToken.length, 67);
    assert.strictEqual(tokenHash.length, 64);
    assert.strictEqual(tokenSuffix, plainToken.slice(-8));
  });

  it("hashes tokens deterministically", () => {
    const token = "mw_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd";
    assert.strictEqual(hashToken(token), hashToken(token));
    assert.notStrictEqual(hashToken(token), hashToken(`${token}x`));
  });

  it("builds a masked token preview from the stored suffix", () => {
    assert.strictEqual(
      getMaskedToken({ token_suffix: "90abcdef" }),
      "mw_****************90abcdef"
    );
  });
});
