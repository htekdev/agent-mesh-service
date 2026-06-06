// meshwire mcp -- MCP stdio server for Copilot CLI and MCP-compatible agents
// Starts an MCP server over stdio that exposes MeshWire tools.
// Usage: meshwire mcp --mesh <meshId> --agent <name>
//
// Tool inventory:
//   meshwire_send_message   -- send a message to the mesh
//   meshwire_get_messages   -- long-poll for incoming messages
//   meshwire_register_agent -- register as an agent (auto-called on start)
//   meshwire_list_agents    -- list agents in the mesh
//   meshwire_heartbeat      -- send heartbeat to stay active
//   meshwire_mesh_info      -- get mesh metadata

import chalk from 'chalk';
import { readConfig, writeConfig } from '../config.js';
import { MeshWireClient } from '../api.js';

// --- MCP Protocol Helpers -----------------------------------------------------

function mcpResponse(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function mcpError(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

function mcpNotification(method, params) {
  return JSON.stringify({ jsonrpc: '2.0', method, params });
}

// --- Tool Definitions ---------------------------------------------------------

function buildTools(meshId) {
  return [
    {
      name: 'meshwire_send_message',
      description: `Send a message to agents in mesh '${meshId}'. Use recipient_id: '*' to broadcast to all agents.`,
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Message content (max 10KB)' },
          recipient_id: { type: 'string', description: "Target agent_id, or '*' for broadcast", default: '*' },
          priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low'], default: 'normal' },
        },
        required: ['content'],
      },
    },
    {
      name: 'meshwire_get_messages',
      description: `Long-poll for new messages in mesh '${meshId}'. Returns immediately if messages exist, otherwise waits.`,
      inputSchema: {
        type: 'object',
        properties: {
          offset: { type: 'integer', description: 'Return messages with ID > offset', default: 0 },
          timeout: { type: 'integer', description: 'Poll timeout in seconds (max 30)', default: 10 },
          recipient_id: { type: 'string', description: 'Filter messages for this agent_id (optional)' },
        },
      },
    },
    {
      name: 'meshwire_list_agents',
      description: `List all agents currently registered in mesh '${meshId}'.`,
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'meshwire_heartbeat',
      description: 'Send a heartbeat to keep your agent marked as active in the mesh.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'meshwire_mesh_info',
      description: `Get metadata about mesh '${meshId}'.`,
      inputSchema: { type: 'object', properties: {} },
    },
  ];
}

// --- MCP Server ---------------------------------------------------------------

export async function cmdMcp(opts) {
  const config = readConfig();
  const meshId = opts.mesh || config.meshId;
  const agentName = opts.agent || config.agentName || 'meshwire-mcp';

  if (!config.token) {
    process.stderr.write('meshwire: no token configured. Run `meshwire init` first.\n');
    process.exit(1);
  }
  if (!meshId) {
    process.stderr.write('meshwire: no mesh configured. Run `meshwire init` or pass --mesh.\n');
    process.exit(1);
  }

  const client = new MeshWireClient({ meshId });

  // Register as an agent on startup
  let agentId = config.agentId;
  try {
    const agent = await client.registerAgent(meshId, {
      name: agentName,
      description: 'MeshWire MCP server',
      workspace: process.env.COMPUTERNAME || process.env.HOSTNAME || 'mcp',
      metadata: { platform: 'mcp', version: '0.1.0' },
    });
    agentId = agent.agent_id;
    writeConfig({ agentId, agentName });
    process.stderr.write(`meshwire-mcp: registered as ${agentName} (${agentId})\n`);
  } catch (err) {
    process.stderr.write(`meshwire-mcp: agent registration failed -- ${err.message}\n`);
  }

  // Heartbeat every 20s
  const hbInterval = setInterval(async () => {
    if (agentId) {
      try { await client.heartbeat(meshId, agentId); } catch { /* ignore */ }
    }
  }, 20_000);

  process.on('SIGINT', () => { clearInterval(hbInterval); process.exit(0); });
  process.on('SIGTERM', () => { clearInterval(hbInterval); process.exit(0); });

  // MCP stdio protocol -- read JSON-RPC from stdin, write to stdout
  process.stdin.setEncoding('utf8');
  let buf = '';

  process.stdin.on('data', async (chunk) => {
    buf += chunk;
    // MCP messages are newline-delimited JSON
    const lines = buf.split('\n');
    buf = lines.pop(); // keep incomplete last line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        const response = await handleMcpMessage(msg, { client, meshId, agentId, agentName });
        if (response) process.stdout.write(response + '\n');
      } catch (err) {
        process.stderr.write(`meshwire-mcp: parse error -- ${err.message}\n`);
      }
    }
  });

  process.stdin.on('end', () => { clearInterval(hbInterval); process.exit(0); });
}

async function handleMcpMessage(msg, { client, meshId, agentId }) {
  const { id, method, params } = msg;

  switch (method) {
    // -- Capability negotiation ----------------------------------
    case 'initialize':
      return mcpResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'meshwire', version: '0.1.0' },
      });

    case 'notifications/initialized':
      return null; // Notification, no response

    // -- Tool listing --------------------------------------------
    case 'tools/list':
      return mcpResponse(id, { tools: buildTools(meshId) });

    // -- Tool execution ------------------------------------------
    case 'tools/call': {
      const { name, arguments: args = {} } = params;
      try {
        const result = await executeTool(name, args, { client, meshId, agentId });
        return mcpResponse(id, {
          content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
        });
      } catch (err) {
        return mcpError(id, -32000, err.message);
      }
    }

    default:
      return mcpError(id, -32601, `Method not found: ${method}`);
  }
}

async function executeTool(name, args, { client, meshId, agentId }) {
  switch (name) {
    case 'meshwire_send_message': {
      const msg = await client.sendMessage(meshId, {
        senderId: agentId,
        recipientId: args.recipient_id || '*',
        content: args.content,
        priority: args.priority || 'normal',
      });
      return `Message sent (id: ${msg.message_id}) to ${msg.recipient_id === '*' ? 'all agents' : msg.recipient_id}`;
    }

    case 'meshwire_get_messages': {
      const { messages, count } = await client.pollMessages(meshId, {
        recipientId: args.recipient_id || agentId,
        offset: args.offset || 0,
        timeout: Math.min(args.timeout || 10, 30),
      });
      if (count === 0) return 'No new messages.';
      return messages.map((m) =>
        `[${m.message_id}] from:${m.sender_id} to:${m.recipient_id} -- ${m.content}`
      ).join('\n');
    }

    case 'meshwire_list_agents': {
      const { agents, count } = await client.listAgents(meshId);
      if (count === 0) return 'No agents registered.';
      return agents.map((a) =>
        `${a.status === 'active' ? '*' : '-'} ${a.name} (${a.agent_id})`
      ).join('\n');
    }

    case 'meshwire_heartbeat': {
      if (!agentId) return 'No agent ID -- run meshwire init first.';
      await client.heartbeat(meshId, agentId);
      return `Heartbeat sent (${new Date().toISOString()})`;
    }

    case 'meshwire_mesh_info': {
      const mesh = await client.getMesh(meshId);
      return `Mesh: ${mesh.name} (${mesh.mesh_id})\nCreated: ${mesh.created_at}\nAgents: ${mesh.agent_count}`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
