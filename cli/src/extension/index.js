// MeshWire Copilot CLI Extension Factory
//
// Usage (thin extension.mjs):
//
//   import { joinSession } from "@github/copilot-sdk/extension";
//   import { createCopilotExtension } from "meshwire/extension";
//   await createCopilotExtension({ joinSession });
//
// The factory owns all state, tools, hooks, polling, and heartbeat.
// It takes `joinSession` via dependency injection so the extension file
// never needs to import the Copilot SDK -- and the package stays zero-dep.
//
// Options:
//   joinSession  (required) -- the joinSession function from @github/copilot-sdk/extension
//   url          (optional) -- override the MeshWire base URL (default: https://meshwire.io)
//   pollInterval (optional) -- ms between background message polls (default: 15000)
//   heartbeatInterval (optional) -- ms between agent heartbeats (default: 60000)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveToken, resolveMeshId, resolveAgentName, resolveUrl } from '../auth.js';
import { readMeshJson } from '../mesh-schema.js';

// ---- Context file (ships inside the package) ----------------------------------------

const CONTEXT_FILE = join(dirname(fileURLToPath(import.meta.url)), 'context.md');

function loadContext() {
  try {
    return readFileSync(CONTEXT_FILE, 'utf-8').trim();
  } catch {
    return '[meshwire] Connected. Use mesh_* tools to communicate with agents.';
  }
}

// ---- Offset persistence (keeps message replay from happening on reload) ---------------

const OFFSET_DIR  = join(homedir(), '.meshwire');
const OFFSET_FILE = join(OFFSET_DIR, '.extension-offset');

function loadOffset() {
  try {
    if (existsSync(OFFSET_FILE)) {
      const val = parseInt(readFileSync(OFFSET_FILE, 'utf-8').trim(), 10);
      return Number.isFinite(val) ? val : 0;
    }
  } catch { /* fresh start */ }
  return 0;
}

function saveOffset(offset) {
  try { writeFileSync(OFFSET_FILE, String(offset), 'utf-8'); } catch { /* best-effort */ }
}

// ---- Core API fetch ------------------------------------------------------------------

async function meshRequest(baseUrl, method, path, body) {
  const token = resolveToken();
  if (!token) throw new Error('Not authenticated. Run: meshwire login');

  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(baseUrl + path, opts);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    let msg;
    try { msg = JSON.parse(txt).error; } catch { msg = txt || res.statusText; }
    throw new Error(`${res.status}: ${msg}`);
  }
  return res.json();
}

// ---- Factory -------------------------------------------------------------------------

export async function createCopilotExtension({
  joinSession,
  url: urlOverride,
  pollInterval    = 15_000,
  heartbeatInterval = 60_000,
} = {}) {
  if (!joinSession) {
    throw new Error(
      'createCopilotExtension: joinSession is required.\n' +
      'Pass it from @github/copilot-sdk/extension:\n' +
      '  import { joinSession } from "@github/copilot-sdk/extension";\n' +
      '  import { createCopilotExtension } from "meshwire/extension";\n' +
      '  await createCopilotExtension({ joinSession });'
    );
  }

  // ---- Mutable state (one set per extension instance) --------------------------------
  let agentId        = null;
  let agentName      = null;
  let heartbeatTimer = null;
  let pollTimer      = null;
  let lastOffset     = loadOffset();

  // session is set after joinSession() returns -- routing fn uses closure ref
  let session        = null;

  // ---- Helpers -----------------------------------------------------------------------

  function baseUrl() {
    return (urlOverride || resolveUrl()).replace(/\/$/, '');
  }

  function api(method, path, body) {
    return meshRequest(baseUrl(), method, path, body);
  }

  function currentAgentId() {
    return agentId || null;
  }

  // ---- Registration ------------------------------------------------------------------

  async function register() {
    const token   = resolveToken();
    const meshId  = resolveMeshId();
    if (!token || !meshId) return null;

    agentName = resolveAgentName();
    const meshJson = readMeshJson();
    const workspace = meshJson?.workspace_name
      || process.cwd().split(/[/\\]/).pop()
      || 'workspace';

    const agent = await api('POST', `/mesh/${meshId}/agents`, {
      name:        agentName,
      description: 'GitHub Copilot CLI agent',
      workspace,
      metadata:    { platform: 'copilot-cli', harness: 'meshwire' },
    });

    agentId = agent.agent_id;
    return agent;
  }

  // ---- Heartbeat ---------------------------------------------------------------------

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(async () => {
      const meshId = resolveMeshId();
      if (!agentId || !meshId) return;
      try { await api('POST', `/mesh/${meshId}/agents/${agentId}/heartbeat`); }
      catch { /* best-effort */ }
    }, heartbeatInterval);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  // ---- Auto-polling ------------------------------------------------------------------

  function routeMessage(msg) {
    if (!session) return;
    const prompt =
      `[MeshWire -- Incoming Message]\n` +
      `From: ${msg.sender_id}\n` +
      `Priority: ${msg.priority}\n` +
      `Message ID: ${msg.message_id}\n` +
      `Sent: ${msg.created_at}\n\n` +
      `${msg.content}\n\n` +
      `---\n` +
      `To reply, call mesh_reply_to_message(message_id=${msg.message_id}, content="...").`;

    session.send({ prompt, mode: 'immediate' }).catch(() => { /* non-fatal */ });
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      const meshId = resolveMeshId();
      if (!agentId || !meshId) return;
      try {
        const params = new URLSearchParams({
          recipient: agentId,
          offset:    String(lastOffset),
          timeout:   '1',
          limit:     '10',
        });
        const result = await api('GET', `/mesh/${meshId}/messages?${params}`);
        if (result.messages?.length) {
          const before = lastOffset;
          for (const msg of result.messages) {
            if (msg.message_id > before) {
              routeMessage(msg);
              if (msg.message_id > lastOffset) lastOffset = msg.message_id;
            }
          }
          if (lastOffset > before) saveOffset(lastOffset);
        }
      } catch { /* service may be temporarily unreachable -- best-effort */ }
    }, pollInterval);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ---- Tool definitions --------------------------------------------------------------

  const tools = [
    {
      name: 'mesh_send_message',
      description:
        'Send a message to an agent in the mesh. Use recipient_id from mesh_list_agents, ' +
        'or "*" to broadcast to all agents. Requires an active mesh (run: meshwire mesh use <id>).',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'Message content (max 10KB).',
          },
          recipient_id: {
            type: 'string',
            description: 'Target agent ID from mesh_list_agents, or "*" to broadcast. Default: "*".',
          },
          priority: {
            type: 'string',
            enum: ['urgent', 'high', 'normal', 'low'],
            description: 'Message priority. Default: "normal".',
          },
        },
        required: ['content'],
      },
      handler: async (args) => {
        const meshId = resolveMeshId();
        if (!meshId) {
          return {
            textResultForLlm: 'No active mesh. Run: meshwire mesh use <id>',
            resultType: 'failure',
          };
        }
        const senderId = currentAgentId() || 'copilot-cli';
        try {
          const msg = await api('POST', `/mesh/${meshId}/messages`, {
            sender_id:    senderId,
            recipient_id: args.recipient_id || '*',
            content:      args.content,
            priority:     args.priority || 'normal',
          });
          return {
            textResultForLlm: `Message sent (id: ${msg.message_id}) to ${args.recipient_id || '*'}.`,
            resultType: 'success',
          };
        } catch (err) {
          return { textResultForLlm: `Send failed: ${err.message}`, resultType: 'failure' };
        }
      },
    },

    {
      name: 'mesh_get_messages',
      description:
        'Fetch messages addressed to this agent. Supports long-polling up to 30s. ' +
        'Note: messages also arrive automatically every 15s via the background poll loop.',
      parameters: {
        type: 'object',
        properties: {
          offset: {
            type: 'integer',
            description: 'Return messages with message_id > offset. Default: 0.',
          },
          timeout: {
            type: 'integer',
            description: 'Long-poll timeout in seconds (max 30). Default: 10.',
          },
        },
      },
      handler: async (args) => {
        const meshId = resolveMeshId();
        if (!meshId) {
          return {
            textResultForLlm: 'No active mesh. Run: meshwire mesh use <id>',
            resultType: 'failure',
          };
        }
        const recipientId = currentAgentId();
        const params = new URLSearchParams({
          offset:  String(args.offset  ?? 0),
          timeout: String(Math.min(args.timeout ?? 10, 30)),
          limit:   '50',
        });
        if (recipientId) params.set('recipient', recipientId);
        try {
          const result = await api('GET', `/mesh/${meshId}/messages?${params}`);
          if (!result.messages?.length) {
            return { textResultForLlm: 'No new messages.', resultType: 'success' };
          }

          // Advance offset so poll loop does not replay these
          const maxId = Math.max(...result.messages.map((m) => m.message_id));
          if (maxId > lastOffset) { lastOffset = maxId; saveOffset(lastOffset); }

          let out = `${result.messages.length} message(s):\n\n`;
          for (const m of result.messages) {
            out +=
              `[${m.message_id}] from ${m.sender_id} (${m.priority})\n` +
              `Sent: ${m.created_at}\n` +
              `${m.content.slice(0, 500)}${m.content.length > 500 ? '...' : ''}\n\n`;
          }
          return { textResultForLlm: out, resultType: 'success' };
        } catch (err) {
          return { textResultForLlm: `Fetch failed: ${err.message}`, resultType: 'failure' };
        }
      },
    },

    {
      name: 'mesh_reply_to_message',
      description:
        'Reply to a specific message by its message_id. Routes the reply to the original sender ' +
        'and tags it with metadata.reply_to for thread linking.',
      parameters: {
        type: 'object',
        properties: {
          message_id: { type: 'integer', description: 'The message_id to reply to.' },
          content:    { type: 'string',  description: 'Reply content (max 10KB).' },
        },
        required: ['message_id', 'content'],
      },
      handler: async (args) => {
        const meshId = resolveMeshId();
        if (!meshId) {
          return {
            textResultForLlm: 'No active mesh. Run: meshwire mesh use <id>',
            resultType: 'failure',
          };
        }
        const senderId = currentAgentId() || 'copilot-cli';
        try {
          const reply = await api(
            'POST', `/mesh/${meshId}/messages/${args.message_id}/reply`,
            { sender_id: senderId, content: args.content }
          );
          return {
            textResultForLlm: `Reply sent (id: ${reply.message_id}) to ${reply.recipient_id}.`,
            resultType: 'success',
          };
        } catch (err) {
          return { textResultForLlm: `Reply failed: ${err.message}`, resultType: 'failure' };
        }
      },
    },

    {
      name: 'mesh_list_agents',
      description:
        'List all agents registered in this workspace mesh. Use agent_id values as ' +
        'recipient_id in mesh_send_message.',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        const meshId = resolveMeshId();
        if (!meshId) {
          return {
            textResultForLlm: 'No active mesh. Run: meshwire mesh use <id>',
            resultType: 'failure',
          };
        }
        try {
          const result = await api('GET', `/mesh/${meshId}/agents`);
          const agents = result.agents || [];
          if (!agents.length) {
            return { textResultForLlm: 'No agents registered in this mesh yet.', resultType: 'success' };
          }
          let out = `${agents.length} agent(s) in mesh ${meshId}:\n\n`;
          for (const a of agents) {
            const me = a.agent_id === agentId ? ' (YOU)' : '';
            out +=
              `[${a.status === 'active' ? 'active' : 'inactive'}] ${a.name}${me}\n` +
              `  Agent ID: ${a.agent_id}\n` +
              `  Workspace: ${a.workspace || '--'}\n` +
              `  Last seen: ${a.last_seen}\n\n`;
          }
          return { textResultForLlm: out, resultType: 'success' };
        } catch (err) {
          return { textResultForLlm: `List failed: ${err.message}`, resultType: 'failure' };
        }
      },
    },

    {
      name: 'mesh_status',
      description: 'Check MeshWire connection status -- credentials, mesh ID, agent registration, service health.',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        const token   = resolveToken();
        const meshId  = resolveMeshId();
        const health  = await fetch(`${baseUrl()}/health`)
          .then((r) => r.json())
          .catch(() => ({ status: 'unreachable' }));

        const out =
          `MeshWire Status\n` +
          `Service:    ${health.status || 'unreachable'} (v${health.version || '?'})\n` +
          `Auth:       ${token ? 'authenticated' : 'not authenticated -- run: meshwire login'}\n` +
          `Agent:      ${agentId ? `${agentName} (${agentId})` : 'not registered'}\n` +
          `Mesh:       ${meshId  || 'none -- run: meshwire mesh use <id>'}\n` +
          `Offset:     ${lastOffset}\n` +
          `Heartbeat:  ${heartbeatTimer ? `active (every ${heartbeatInterval / 1000}s)` : 'stopped'}\n` +
          `Poll loop:  ${pollTimer      ? `active (every ${pollInterval     / 1000}s)` : 'stopped'}`;

        return { textResultForLlm: out, resultType: 'success' };
      },
    },
  ];

  // ---- Hooks -------------------------------------------------------------------------

  const hooks = {
    onSessionStart: async () => {
      const meshId    = resolveMeshId();
      const token     = resolveToken();
      const context   = loadContext();

      const runtimeLine =
        `Agent: ${agentName || resolveAgentName()} ` +
        `(id: ${agentId || 'unregistered'}) | ` +
        `Mesh: ${meshId || 'none'} | ` +
        `Auth: ${token ? 'yes' : 'no'}`;

      return { additionalContext: `${context}\n\n${runtimeLine}` };
    },

    onSessionEnd: async () => {
      stopHeartbeat();
      stopPolling();
      return { cleanupActions: ['Stopped MeshWire heartbeat and message polling'] };
    },
  };

  // ---- Wire everything up ------------------------------------------------------------

  session = await joinSession({ hooks, tools });

  // Register agent and start background processes
  try {
    const result = await register();
    if (result) {
      startHeartbeat();
      startPolling();
      await session.log(
        `MeshWire: registered as "${agentName}" (${agentId}) -- ` +
        `heartbeat every ${heartbeatInterval / 1000}s, ` +
        `polling every ${pollInterval / 1000}s`
      );
    } else {
      await session.log(
        'MeshWire: not registered (missing credentials or mesh). ' +
        'Run: meshwire login, then: meshwire mesh use <id>'
      );
    }
  } catch (err) {
    await session.log(`MeshWire startup error: ${err.message}`);
  }

  return session;
}
