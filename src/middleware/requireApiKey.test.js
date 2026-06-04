import assert from "node:assert";
import { describe, it } from "node:test";
import { createRequireApiKey, hashApiToken } from "./requireApiKey.js";

function createResponseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("requireApiKey middleware", () => {
  it("attaches the user for a valid bearer token", async () => {
    const token = "mw_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd";
    const expectedHash = hashApiToken(token);
    const user = { user_id: "usr_123", plan: "free" };
    const req = {
      get(headerName) {
        return headerName === "authorization" ? `Bearer ${token}` : undefined;
      },
    };
    const res = createResponseRecorder();
    let nextCalled = false;

    const middleware = createRequireApiKey(async (tokenHash) => {
      assert.strictEqual(tokenHash, expectedHash);
      return user;
    });

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    assert.deepStrictEqual(req.user, user);
  });

  it("rejects missing tokens", async () => {
    const req = {
      get() {
        return "";
      },
    };
    const res = createResponseRecorder();
    let nextCalled = false;

    await createRequireApiKey(async () => null)(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.ok(res.body.error.includes("meshwire.io"));
  });
});
