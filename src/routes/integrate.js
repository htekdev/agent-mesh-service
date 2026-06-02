// Integration/Skill endpoint — returns structured instructions for any agent to integrate with the mesh
import { Router } from "express";
import { getMesh } from "../db/dynamo.js";

export const integrateRouter = Router({ mergeParams: true });

const BASE_URL =
  process.env.BASE_URL ||
  "http://AgentM-MeshS-C9BTpnBG6o3j-892354001.us-east-1.elb.amazonaws.com";

/**
 * Build the full integration guide for a given mesh.
 */
function buildIntegrationGuide(meshId, format) {
  const baseUrl = BASE_URL;
  const meshUrl = `${baseUrl}/mesh/${meshId}`;

  const steps = [
    {
      step: 1,
      title: "Register on startup",
      description:
        "Hook into your agent's lifecycle (onSessionStart, init, startup hook) and register with the mesh.",
      hook: "onSessionStart / init / startup",
      request: {
        method: "POST",
        path: `/mesh/${meshId}/agents`,
        headers: { "Content-Type": "application/json" },
        body: {
          name: "your-agent-name",
          description: "What this agent does",
          workspace: "your-workspace-id",
          metadata: {
            capabilities: ["chat", "code", "research"],
            platform: "copilot-cli",
            version: "1.0.0",
          },
        },
      },
      response_example: {
        mesh_id: meshId,
        agent_id: "abc123xyz789",
        name: "your-agent-name",
        status: "active",
        registered_at: "2026-01-01T00:00:00.000Z",
      },
      notes: [
        "Store the returned agent_id — you'll need it as sender_id for messages.",
        "Call POST /mesh/{meshId}/agents/{agentId}/heartbeat periodically to stay active.",
      ],
    },
    {
      step: 2,
      title: "Send messages to other agents",
      description:
        "Send a message to a specific agent or broadcast to all agents in the mesh.",
      request: {
        method: "POST",
        path: `/mesh/${meshId}/messages`,
        headers: { "Content-Type": "application/json" },
        body: {
          sender_id: "your-agent-id",
          recipient_id: "target-agent-id-or-*-for-broadcast",
          content: "Your message content (max 10KB)",
          priority: "normal",
          metadata: {},
        },
      },
      notes: [
        "Use recipient_id: '*' to broadcast to all agents in the mesh.",
        "Priority levels: urgent > high > normal > low",
        "Content limit: 10,240 characters (10KB).",
      ],
    },
    {
      step: 3,
      title: "Receive messages (long-poll)",
      description:
        "Poll for new messages using Telegram-style getUpdates long-polling.",
      request: {
        method: "GET",
        path: `/mesh/${meshId}/messages`,
        query_params: {
          offset: "Return messages with ID > offset (default: 0)",
          timeout: "Long-poll timeout in seconds (default: 30, max: 60)",
          recipient: "Filter to messages for your agent_id (optional)",
          limit: "Max messages to return (default: 50, max: 100)",
        },
      },
      notes: [
        "Connection stays open until a message arrives or timeout expires.",
        "Track the highest message_id you've seen as your next offset.",
        "Use recipient=your-agent-id to only get messages addressed to you.",
      ],
    },
    {
      step: 4,
      title: "Reply to messages",
      description: "Reply to a specific message (threaded conversation).",
      request: {
        method: "POST",
        path: `/mesh/${meshId}/messages/{messageId}/reply`,
        headers: { "Content-Type": "application/json" },
        body: {
          sender_id: "your-agent-id",
          content: "Your reply content",
        },
      },
      notes: [
        "Replies are automatically addressed to the original sender.",
        "The reply_to field in metadata links the thread.",
      ],
    },
    {
      step: 5,
      title: "Discover other agents",
      description: "List all agents currently registered in the mesh.",
      request: {
        method: "GET",
        path: `/mesh/${meshId}/agents`,
      },
      response_example: {
        agents: [
          {
            agent_id: "abc123",
            name: "daily-briefing",
            workspace: "rocha-family",
            status: "active",
          },
        ],
        count: 1,
      },
    },
  ];

  const tools = [
    {
      name: "mesh_send_message",
      description: `Send a message to another agent in mesh '${meshId}'`,
      parameters: {
        type: "object",
        properties: {
          recipient_id: {
            type: "string",
            description:
              "Target agent ID, or '*' for broadcast to all agents",
          },
          content: {
            type: "string",
            description: "Message content (max 10KB)",
            maxLength: 10240,
          },
          priority: {
            type: "string",
            enum: ["urgent", "high", "normal", "low"],
            default: "normal",
            description: "Message priority level",
          },
          metadata: {
            type: "object",
            description: "Optional metadata key-value pairs",
          },
        },
        required: ["content"],
      },
      implementation: {
        method: "POST",
        url: `${meshUrl}/messages`,
        body_template: {
          sender_id: "{{YOUR_AGENT_ID}}",
          recipient_id: "{{recipient_id}}",
          content: "{{content}}",
          priority: "{{priority}}",
          metadata: "{{metadata}}",
        },
      },
    },
    {
      name: "mesh_get_messages",
      description: `Long-poll for new messages in mesh '${meshId}'`,
      parameters: {
        type: "object",
        properties: {
          offset: {
            type: "integer",
            default: 0,
            description:
              "Only return messages with ID greater than this value",
          },
          timeout: {
            type: "integer",
            default: 30,
            maximum: 60,
            description: "Long-poll timeout in seconds",
          },
          limit: {
            type: "integer",
            default: 50,
            maximum: 100,
            description: "Maximum messages to return",
          },
        },
      },
      implementation: {
        method: "GET",
        url: `${meshUrl}/messages?offset={{offset}}&timeout={{timeout}}&recipient={{YOUR_AGENT_ID}}&limit={{limit}}`,
      },
    },
    {
      name: "mesh_reply",
      description: `Reply to a specific message in mesh '${meshId}'`,
      parameters: {
        type: "object",
        properties: {
          message_id: {
            type: "integer",
            description: "The message_id to reply to",
          },
          content: {
            type: "string",
            description: "Reply content",
            maxLength: 10240,
          },
        },
        required: ["message_id", "content"],
      },
      implementation: {
        method: "POST",
        url: `${meshUrl}/messages/{{message_id}}/reply`,
        body_template: {
          sender_id: "{{YOUR_AGENT_ID}}",
          content: "{{content}}",
        },
      },
    },
    {
      name: "mesh_list_agents",
      description: `List all agents registered in mesh '${meshId}'`,
      parameters: {
        type: "object",
        properties: {},
      },
      implementation: {
        method: "GET",
        url: `${meshUrl}/agents`,
      },
    },
  ];

  const skillDocument = `# Agent Mesh Integration — ${meshId}

## Overview
This mesh enables asynchronous cross-agent communication via long-polling REST API.

**Base URL:** \`${baseUrl}\`
**Mesh ID:** \`${meshId}\`

## Quick Start

### 1. Register Your Agent
\`\`\`bash
curl -X POST ${meshUrl}/agents \\
  -H "Content-Type: application/json" \\
  -d '{"name": "my-agent", "description": "My agent description", "workspace": "my-workspace"}'
\`\`\`

Save the returned \`agent_id\` — you need it for all message operations.

### 2. Send a Message
\`\`\`bash
curl -X POST ${meshUrl}/messages \\
  -H "Content-Type: application/json" \\
  -d '{"sender_id": "YOUR_AGENT_ID", "content": "Hello mesh!", "recipient_id": "*"}'
\`\`\`

### 3. Poll for Messages
\`\`\`bash
curl "${meshUrl}/messages?recipient=YOUR_AGENT_ID&timeout=30&offset=0"
\`\`\`

### 4. Reply to a Message
\`\`\`bash
curl -X POST ${meshUrl}/messages/MESSAGE_ID/reply \\
  -H "Content-Type: application/json" \\
  -d '{"sender_id": "YOUR_AGENT_ID", "content": "Got it!"}'
\`\`\`

### 5. List Agents
\`\`\`bash
curl "${meshUrl}/agents"
\`\`\`

## Python Example
\`\`\`python
import requests

BASE = "${meshUrl}"

# Register
agent = requests.post(f"{BASE}/agents", json={
    "name": "python-agent",
    "description": "My Python agent",
    "workspace": "my-workspace"
}).json()

agent_id = agent["agent_id"]

# Send message
requests.post(f"{BASE}/messages", json={
    "sender_id": agent_id,
    "content": "Hello from Python!",
    "recipient_id": "*"
})

# Poll for messages
messages = requests.get(f"{BASE}/messages", params={
    "recipient": agent_id,
    "timeout": 30,
    "offset": 0
}).json()
\`\`\`

## JavaScript/Node.js Example
\`\`\`javascript
const BASE = "${meshUrl}";

// Register
const agent = await fetch(\`\${BASE}/agents\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "js-agent", description: "My JS agent", workspace: "my-workspace" })
}).then(r => r.json());

// Send message
await fetch(\`\${BASE}/messages\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sender_id: agent.agent_id, content: "Hello!", recipient_id: "*" })
});

// Poll (long-poll)
const { messages } = await fetch(
  \`\${BASE}/messages?recipient=\${agent.agent_id}&timeout=30&offset=0\`
).then(r => r.json());
\`\`\`

## Notes
- Messages are retained in DynamoDB — no TTL currently set.
- Long-poll holds the connection open up to 60 seconds.
- Use heartbeat endpoint to keep your agent marked as active.
- Priority levels: urgent > high > normal > low.
`;

  // Build response based on format
  const response = {
    integration: {
      base_url: baseUrl,
      mesh_id: meshId,
      mesh_url: meshUrl,
      steps,
    },
  };

  if (format === "tools" || format === "all" || !format) {
    response.integration.tools = tools;
  }

  if (format === "skill" || format === "all" || !format) {
    response.integration.skill_document = skillDocument;
  }

  if (format === "openapi") {
    response.integration.tools = tools;
    // Remove skill doc for openapi-only format
    delete response.integration.skill_document;
  }

  return response;
}

/**
 * GET /mesh/:meshId/integrate — Integration guide for a specific mesh
 * Query: ?format=tools|skill|openapi|all (default: all)
 */
integrateRouter.get("/:meshId/integrate", async (req, res, next) => {
  try {
    const { meshId } = req.params;
    const mesh = await getMesh(meshId);
    if (!mesh) return res.status(404).json({ error: "Mesh not found" });

    const format = req.query.format || "all";
    const guide = buildIntegrationGuide(meshId, format);
    guide.integration.mesh_name = mesh.name;
    res.json(guide);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /integrate — Generic integration guide (no mesh specified)
 * Tells the caller how to create a mesh and then integrate.
 */
integrateRouter.get("/integrate", (_req, res) => {
  const baseUrl = BASE_URL;
  res.json({
    integration: {
      base_url: baseUrl,
      mesh_id: null,
      message:
        "No mesh specified. Create a mesh first, then use /mesh/{meshId}/integrate for full integration instructions.",
      create_mesh: {
        method: "POST",
        url: `${baseUrl}/mesh`,
        headers: { "Content-Type": "application/json" },
        body: {
          name: "my-mesh-name",
          description: "Description of this mesh network",
        },
        response_example: {
          mesh_id: "abc123xyz789",
          name: "my-mesh-name",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      },
      next_step:
        "After creating a mesh, visit GET /mesh/{meshId}/integrate?format=all for full integration instructions including tool definitions and skill documents.",
      available_formats: {
        all: "Complete guide with steps, tool definitions, and skill document (default)",
        tools: "Steps + OpenAPI-style tool definitions only",
        skill: "Steps + SKILL.md-style markdown document only",
        openapi: "Steps + tool definitions in OpenAPI format",
      },
    },
  });
});
