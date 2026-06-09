// @ts-check
/**
 * TIER 1 -- Init Command Integration Tests
 *
 * Tests that `meshwire init --harness copilot` produces the correct file artifacts:
 * - ~/.copilot/extensions/meshwire.mjs (extension file)
 * - .mesh.json in the project root
 * - The extension exports mesh_send_message, mesh_get_messages tools
 * - The onSessionStart hook is configured
 *
 * These tests run in an isolated temp directory with mocked credentials
 * to avoid hitting the network or polluting the real home directory.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";

// Path to the CLI entry point
const CLI_BIN = join(import.meta.dirname, "..", "..", "cli", "bin", "meshwire.js");

describe("Tier 1 -- Init Command (File Verification)", () => {
  let tempDir;
  let fakeHome;

  beforeEach(() => {
    // Create isolated temp directories
    tempDir = mkdtempSync(join(tmpdir(), "meshwire-test-workspace-"));
    fakeHome = mkdtempSync(join(tmpdir(), "meshwire-test-home-"));

    // Create fake credentials so init --harness copilot does not error
    const meshwireDir = join(fakeHome, ".meshwire");
    mkdirSync(meshwireDir, { recursive: true });
    writeFileSync(
      join(meshwireDir, "credentials.json"),
      JSON.stringify({
        token: "mw_test_fake_token_for_init_tests",
        login: "test-user",
        agentId: "agent-test-123",
        defaultMeshId: "mesh-test-abc",
        savedAt: new Date().toISOString(),
      }),
      "utf8"
    );
  });

  afterEach(() => {
    // Cleanup temp dirs
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  });

  function runInit(args = "", opts = {}) {
    const env = {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      HOMEPATH: fakeHome,
      // Prevent network calls during init
      MESHWIRE_URL: "http://localhost:9999",
    };

    return execSync(`node "${CLI_BIN}" init ${args}`, {
      cwd: opts.cwd || tempDir,
      env,
      encoding: "utf8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  test("init --harness copilot creates .mesh.json in workspace root", () => {
    try {
      runInit("--harness copilot --mesh mesh-test-abc --agent test-copilot-agent");
    } catch (e) {
      // init may fail on agent registration (no server) but should still create files
    }

    const meshJsonPath = join(tempDir, ".mesh.json");
    assert.ok(existsSync(meshJsonPath), ".mesh.json should exist in workspace root");

    const meshJson = JSON.parse(readFileSync(meshJsonPath, "utf8"));
    assert.strictEqual(meshJson.mesh_id, "mesh-test-abc", "mesh_id should match");
    assert.strictEqual(meshJson.harness, "copilot", "harness should be copilot");
    assert.strictEqual(meshJson.agent_name, "test-copilot-agent", "agent_name should match");
    assert.ok(meshJson.workspace_name, "workspace_name should be set");
  });

  test("init --harness copilot creates extension file at ~/.copilot/extensions/meshwire.mjs", () => {
    try {
      runInit("--harness copilot --mesh mesh-test-abc --agent test-copilot-agent");
    } catch (e) {
      // May fail on registration but file creation should succeed
    }

    const extensionPath = join(fakeHome, ".copilot", "extensions", "meshwire.mjs");
    assert.ok(existsSync(extensionPath), `Extension should exist at ${extensionPath}`);

    const extensionSource = readFileSync(extensionPath, "utf8");
    assert.ok(extensionSource.length > 100, "Extension file should have substantial content");
  });

  test("extension file exports mesh_send_message tool", () => {
    try {
      runInit("--harness copilot --mesh mesh-test-abc --agent my-agent");
    } catch (e) { /* ignore registration failure */ }

    const extensionPath = join(fakeHome, ".copilot", "extensions", "meshwire.mjs");
    const source = readFileSync(extensionPath, "utf8");

    assert.ok(
      source.includes("mesh_send_message"),
      "Extension should define mesh_send_message tool"
    );
  });

  test("extension file exports mesh_get_messages tool", () => {
    try {
      runInit("--harness copilot --mesh mesh-test-abc --agent my-agent");
    } catch (e) { /* ignore registration failure */ }

    const extensionPath = join(fakeHome, ".copilot", "extensions", "meshwire.mjs");
    const source = readFileSync(extensionPath, "utf8");

    assert.ok(
      source.includes("mesh_get_messages"),
      "Extension should define mesh_get_messages tool"
    );
  });

  test("extension file exports mesh_reply_to_message tool", () => {
    try {
      runInit("--harness copilot --mesh mesh-test-abc --agent my-agent");
    } catch (e) { /* ignore registration failure */ }

    const extensionPath = join(fakeHome, ".copilot", "extensions", "meshwire.mjs");
    const source = readFileSync(extensionPath, "utf8");

    assert.ok(
      source.includes("mesh_reply_to_message"),
      "Extension should define mesh_reply_to_message tool"
    );
  });

  test("extension file exports mesh_list_agents tool", () => {
    try {
      runInit("--harness copilot --mesh mesh-test-abc --agent my-agent");
    } catch (e) { /* ignore registration failure */ }

    const extensionPath = join(fakeHome, ".copilot", "extensions", "meshwire.mjs");
    const source = readFileSync(extensionPath, "utf8");

    assert.ok(
      source.includes("mesh_list_agents"),
      "Extension should define mesh_list_agents tool"
    );
  });

  test("extension file exports mesh_status tool", () => {
    try {
      runInit("--harness copilot --mesh mesh-test-abc --agent my-agent");
    } catch (e) { /* ignore registration failure */ }

    const extensionPath = join(fakeHome, ".copilot", "extensions", "meshwire.mjs");
    const source = readFileSync(extensionPath, "utf8");

    assert.ok(
      source.includes("mesh_status"),
      "Extension should define mesh_status tool"
    );
  });

  test("extension file has onSessionStart hook configured", () => {
    try {
      runInit("--harness copilot --mesh mesh-test-abc --agent my-agent");
    } catch (e) { /* ignore registration failure */ }

    const extensionPath = join(fakeHome, ".copilot", "extensions", "meshwire.mjs");
    const source = readFileSync(extensionPath, "utf8");

    assert.ok(
      source.includes("onSessionStart"),
      "Extension should have onSessionStart hook"
    );
    assert.ok(
      source.includes("export const hooks"),
      "Extension should export hooks object"
    );
  });

  test("extension file has onHeartbeat hook configured", () => {
    try {
      runInit("--harness copilot --mesh mesh-test-abc --agent my-agent");
    } catch (e) { /* ignore registration failure */ }

    const extensionPath = join(fakeHome, ".copilot", "extensions", "meshwire.mjs");
    const source = readFileSync(extensionPath, "utf8");

    assert.ok(
      source.includes("onHeartbeat"),
      "Extension should have onHeartbeat hook"
    );
  });

  test("extension exports tools as an array", () => {
    try {
      runInit("--harness copilot --mesh mesh-test-abc --agent my-agent");
    } catch (e) { /* ignore registration failure */ }

    const extensionPath = join(fakeHome, ".copilot", "extensions", "meshwire.mjs");
    const source = readFileSync(extensionPath, "utf8");

    assert.ok(
      source.includes("export const tools = ["),
      "Extension should export tools array"
    );
  });

  test(".mesh.json schema has required fields", () => {
    try {
      runInit("--harness copilot --mesh mesh-test-abc --agent schema-test");
    } catch (e) { /* ignore registration failure */ }

    const meshJsonPath = join(tempDir, ".mesh.json");
    const meshJson = JSON.parse(readFileSync(meshJsonPath, "utf8"));

    // Verify all required schema fields
    assert.ok("mesh_id" in meshJson, "mesh_id field required");
    assert.ok("workspace_name" in meshJson, "workspace_name field required");
    assert.ok("agent_name" in meshJson, "agent_name field required");
    assert.ok("harness" in meshJson, "harness field required");
  });

  test("extension configures correct MeshWire URL", () => {
    try {
      runInit("--harness copilot --mesh mesh-test-abc --agent url-test --url https://meshwire.io");
    } catch (e) { /* ignore registration failure */ }

    const extensionPath = join(fakeHome, ".copilot", "extensions", "meshwire.mjs");
    const source = readFileSync(extensionPath, "utf8");

    assert.ok(
      source.includes("https://meshwire.io"),
      "Extension should use the correct MeshWire URL"
    );
  });

  test("init --help shows --harness option", () => {
    const output = execSync(`node "${CLI_BIN}" init --help`, {
      encoding: "utf8",
      timeout: 10000,
    });

    assert.ok(
      output.includes("harness") || output.includes("--harness"),
      "init --help should show --harness option"
    );
  });
});
