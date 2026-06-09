// @ts-check
/**
 * TIER 2 -- Message Send/Receive Integration Tests
 *
 * Tests the actual API/messaging layer end-to-end:
 * - Create a mesh via API
 * - Register agents in the mesh
 * - Send a message from one agent to another
 * - Verify the message was received correctly
 * - Test broadcast messages
 * - Test reply-to-message flow
 *
 * Runs against the real Express server in mock auth mode (no DynamoDB needed).
 * The server uses in-memory storage when MOCK_AUTH=true and NODE_ENV=test.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { spawn } from "child_process";
import { join } from "path";

const SERVER_DIR = join(import.meta.dirname, "..", "..");
const PORT = 3099; // Use a non-standard port for integration tests
const BASE_URL = `http://localhost:${PORT}`;
const TOKEN = "mw_test_token_abc123def456"; // Matches MOCK_TOKEN in mockAuth.js

let serverProcess;

async function waitForServer(url, maxWaitMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch (e) {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not start within ${maxWaitMs}ms`);
}

function api(method, path, body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`${BASE_URL}${path}`, opts);
}

describe("Tier 2 -- Message Send/Receive (API Integration)", () => {
  before(async () => {
    // Start the server in mock mode
    serverProcess = spawn("node", ["src/index.js"], {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        PORT: String(PORT),
        MOCK_AUTH: "true",
        NODE_ENV: "test",
        SESSION_SECRET: "integration-test-secret",
        AWS_REGION: "us-east-1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Capture server errors for debugging
    serverProcess.stderr.on("data", (data) => {
      const msg = data.toString();
      if (!msg.includes("ExperimentalWarning")) {
        process.stderr.write(`[server] ${msg}`);
      }
    });

    await waitForServer(BASE_URL);
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
    }
  });

  // --- Health Check ---

  test("health endpoint returns ok", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, "ok");
  });

  // --- Mesh Creation ---

  test("create a mesh returns 201 with mesh_id", async () => {
    const res = await api("POST", "/mesh", {
      name: "integration-test-mesh",
      description: "Mesh for integration tests",
    });
    assert.strictEqual(res.status, 201);
    const mesh = await res.json();
    assert.ok(mesh.mesh_id, "Should return a mesh_id");
    assert.strictEqual(mesh.name, "integration-test-mesh");
  });

  test("create mesh without auth returns 401", async () => {
    const res = await fetch(`${BASE_URL}/mesh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "no-auth-mesh" }),
    });
    assert.strictEqual(res.status, 401);
  });

  // --- Agent Registration ---

  test("register an agent in a mesh", async () => {
    // Create mesh first
    const meshRes = await api("POST", "/mesh", { name: "agent-test-mesh" });
    const mesh = await meshRes.json();

    // Register agent
    const agentRes = await api("POST", `/mesh/${mesh.mesh_id}/agents`, {
      name: "agent-alpha",
      description: "First test agent",
      workspace: "workspace-a",
    });
    assert.strictEqual(agentRes.status, 201);
    const agent = await agentRes.json();
    assert.ok(agent.agent_id, "Should return an agent_id");
    assert.strictEqual(agent.name, "agent-alpha");
  });

  // --- Message Sending ---

  test("send a message to the mesh", async () => {
    // Setup: create mesh
    const meshRes = await api("POST", "/mesh", { name: "msg-test-mesh" });
    const mesh = await meshRes.json();

    // Send message
    const msgRes = await api("POST", `/mesh/${mesh.mesh_id}/messages`, {
      sender_id: "agent-a",
      recipient_id: "agent-b",
      content: "Hello from agent-a!",
      priority: "normal",
    });
    assert.strictEqual(msgRes.status, 201);
    const msg = await msgRes.json();
    assert.ok(msg.message_id, "Should return a message_id");
    assert.strictEqual(msg.sender_id, "agent-a");
    assert.strictEqual(msg.recipient_id, "agent-b");
    assert.strictEqual(msg.content, "Hello from agent-a!");
  });

  test("send message requires sender_id", async () => {
    const meshRes = await api("POST", "/mesh", { name: "validation-mesh" });
    const mesh = await meshRes.json();

    const res = await api("POST", `/mesh/${mesh.mesh_id}/messages`, {
      content: "No sender",
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("sender_id"));
  });

  test("send message requires content", async () => {
    const meshRes = await api("POST", "/mesh", { name: "validation-mesh-2" });
    const mesh = await meshRes.json();

    const res = await api("POST", `/mesh/${mesh.mesh_id}/messages`, {
      sender_id: "agent-a",
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("content"));
  });

  test("reject content over 10KB", async () => {
    const meshRes = await api("POST", "/mesh", { name: "size-limit-mesh" });
    const mesh = await meshRes.json();

    const bigContent = "x".repeat(10241);
    const res = await api("POST", `/mesh/${mesh.mesh_id}/messages`, {
      sender_id: "agent-a",
      content: bigContent,
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("10KB"));
  });

  // --- Message Receiving ---

  test("receive messages sent to a specific agent", async () => {
    // Setup
    const meshRes = await api("POST", "/mesh", { name: "receive-test-mesh" });
    const mesh = await meshRes.json();

    // Send a message to agent-b
    await api("POST", `/mesh/${mesh.mesh_id}/messages`, {
      sender_id: "agent-a",
      recipient_id: "agent-b",
      content: "Hello agent-b!",
    });

    // Poll as agent-b (short timeout so test does not hang)
    const pollRes = await api(
      "GET",
      `/mesh/${mesh.mesh_id}/messages?recipient=agent-b&timeout=1&offset=0`
    );
    assert.strictEqual(pollRes.status, 200);
    const result = await pollRes.json();
    assert.ok(result.messages.length >= 1, "Should have at least 1 message");
    assert.strictEqual(result.messages[0].content, "Hello agent-b!");
    assert.strictEqual(result.messages[0].sender_id, "agent-a");
  });

  test("broadcast message is received by any agent", async () => {
    const meshRes = await api("POST", "/mesh", { name: "broadcast-mesh" });
    const mesh = await meshRes.json();

    // Send broadcast (recipient_id = "*")
    await api("POST", `/mesh/${mesh.mesh_id}/messages`, {
      sender_id: "agent-a",
      recipient_id: "*",
      content: "Broadcast to all!",
    });

    // agent-c should receive broadcasts
    const pollRes = await api(
      "GET",
      `/mesh/${mesh.mesh_id}/messages?recipient=agent-c&timeout=1&offset=0`
    );
    assert.strictEqual(pollRes.status, 200);
    const result = await pollRes.json();
    assert.ok(result.messages.length >= 1, "Broadcast should be visible to any agent");
    assert.strictEqual(result.messages[0].content, "Broadcast to all!");
  });

  // --- Full Send/Receive Cycle ---

  test("full agent-to-agent message cycle", async () => {
    // 1. Create mesh
    const meshRes = await api("POST", "/mesh", { name: "full-cycle-mesh" });
    const mesh = await meshRes.json();
    const meshId = mesh.mesh_id;

    // 2. Register two agents
    const agentARes = await api("POST", `/mesh/${meshId}/agents`, {
      name: "sender-agent",
      workspace: "workspace-a",
    });
    const agentA = await agentARes.json();

    const agentBRes = await api("POST", `/mesh/${meshId}/agents`, {
      name: "receiver-agent",
      workspace: "workspace-b",
    });
    const agentB = await agentBRes.json();

    // 3. Agent A sends message to Agent B
    const sendRes = await api("POST", `/mesh/${meshId}/messages`, {
      sender_id: agentA.agent_id,
      recipient_id: agentB.agent_id,
      content: "Hello from A to B -- integration test",
      priority: "high",
    });
    assert.strictEqual(sendRes.status, 201);
    const sentMsg = await sendRes.json();

    // 4. Agent B polls for messages
    const pollRes = await api(
      "GET",
      `/mesh/${meshId}/messages?recipient=${agentB.agent_id}&timeout=1&offset=0`
    );
    const pollResult = await pollRes.json();

    assert.ok(pollResult.messages.length >= 1, "Agent B should receive the message");
    const received = pollResult.messages.find((m) => m.message_id === sentMsg.message_id);
    assert.ok(received, "The specific message should be in the poll results");
    assert.strictEqual(received.content, "Hello from A to B -- integration test");
    assert.strictEqual(received.sender_id, agentA.agent_id);
    assert.strictEqual(received.priority, "high");
  });

  // --- Message to nonexistent mesh ---

  test("sending to nonexistent mesh returns 404", async () => {
    const res = await api("POST", "/mesh/nonexistent-mesh-xyz/messages", {
      sender_id: "agent-a",
      content: "This should fail",
    });
    assert.strictEqual(res.status, 404);
  });

  // --- Priority levels ---

  test("message priority is stored and returned", async () => {
    const meshRes = await api("POST", "/mesh", { name: "priority-mesh" });
    const mesh = await meshRes.json();

    // Send urgent message
    const res = await api("POST", `/mesh/${mesh.mesh_id}/messages`, {
      sender_id: "agent-a",
      recipient_id: "*",
      content: "Urgent task!",
      priority: "urgent",
    });
    const msg = await res.json();
    assert.strictEqual(msg.priority, "urgent");
  });

  // --- List agents ---

  test("list agents shows registered agents", async () => {
    const meshRes = await api("POST", "/mesh", { name: "list-agents-mesh" });
    const mesh = await meshRes.json();

    // Register two agents
    await api("POST", `/mesh/${mesh.mesh_id}/agents`, { name: "alpha", workspace: "ws1" });
    await api("POST", `/mesh/${mesh.mesh_id}/agents`, { name: "beta", workspace: "ws2" });

    // List
    const listRes = await api("GET", `/mesh/${mesh.mesh_id}/agents`);
    assert.strictEqual(listRes.status, 200);
    const result = await listRes.json();
    assert.ok(result.agents.length >= 2, "Should list at least 2 agents");
  });
});
