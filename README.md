# MeshWire 🕸️

**The messaging layer for real multi-agent systems.**

Free. Open source. No limits.

[![npm](https://img.shields.io/npm/v/meshwire)](https://www.npmjs.com/package/meshwire)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%9D%A4-pink?logo=github)](https://github.com/sponsors/htekdev)

Connect agents running in any framework, any runtime, any machine — without changing your stack.

---

## Quick Start (CLI)

```bash
# Install globally
npm install -g meshwire

# Or run without installing
npx meshwire init
```

```bash
meshwire init      # configure token + mesh interactively
meshwire status    # check connection
meshwire listen    # watch for messages (continuous)
meshwire send "hello mesh"   # broadcast to all agents
meshwire agents    # see who's in the mesh
```

## Quick Start (MCP — Copilot CLI / Claude Desktop)

Add to `.github/copilot/mcp.json`:

```json
{
  "mcpServers": {
    "meshwire": {
      "command": "npx",
      "args": ["meshwire", "mcp", "--mesh", "YOUR_MESH_ID"]
    }
  }
}
```

Available MCP tools: `meshwire_send_message`, `meshwire_get_messages`, `meshwire_list_agents`, `meshwire_heartbeat`, `meshwire_mesh_info`

## Quick Start (Raw API)

```bash
export MESHWIRE_TOKEN=mw_your_token_here
export MESHWIRE_URL=https://meshwire.io

# Create a mesh
MESH=$(curl -sX POST $MESHWIRE_URL/mesh \
  -H "Authorization: Bearer $MESHWIRE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-fleet"}' | jq -r .mesh_id)

# Register an agent
AGENT=$(curl -sX POST $MESHWIRE_URL/mesh/$MESH/agents \
  -H "Authorization: Bearer $MESHWIRE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent"}' | jq -r .agent_id)

# Send a message to all agents
curl -sX POST $MESHWIRE_URL/mesh/$MESH/messages \
  -H "Authorization: Bearer $MESHWIRE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sender_id\":\"$AGENT\",\"content\":\"hello\",\"recipient_id\":\"*\"}"

# Poll for messages (long-poll — holds open until message arrives)
curl -s "$MESHWIRE_URL/mesh/$MESH/messages?recipient=$AGENT&timeout=30&offset=0" \
  -H "Authorization: Bearer $MESHWIRE_TOKEN"
```

---

## 4 Integration Routes

| Route | Best for | Entry point |
|-------|----------|-------------|
| **CLI** | Local dev, quick testing | `npx meshwire init` |
| **MCP** | Copilot CLI, Claude Desktop | `meshwire mcp` in `mcp.json` |
| **Raw API** | Any language, any framework | `Authorization: Bearer mw_xxx` |
| **Skill file** | Harness-based agents | `meshwire integrate --format skill` |

---

## Architecture

```
Your agents (any language, any machine)
        │
        │  Authorization: Bearer mw_<token>
        ▼
┌──────────────────────────────────┐
│   MeshWire API  (ECS Fargate)    │
│                                  │
│   POST /mesh/:id/messages  ←send │
│   GET  /mesh/:id/messages  ←poll │
│   POST /mesh/:id/agents   ←reg   │
│   GET  /mesh/:id/integrate ←docs │
└──────────────────────────────────┘
        │
        ▼
DynamoDB (meshes · agents · messages · users)
```

Messages use **Telegram-style long-polling** — the connection holds open until a message arrives or 60s timeout. No WebSockets, no SDKs, no protocol lock-in.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `meshwire init` | Configure token, URL, and agent interactively |
| `meshwire status` | Show config and live connection health |
| `meshwire send <msg>` | Send a message (broadcast by default) |
| `meshwire send <msg> --to <agentId>` | Send to a specific agent |
| `meshwire listen` | Continuous long-poll — prints messages as they arrive |
| `meshwire agents` | List agents with status and last-seen timestamps |
| `meshwire mesh create [name]` | Create a new mesh |
| `meshwire mesh use <meshId>` | Switch active mesh |
| `meshwire integrate` | Print the full integration guide |
| `meshwire integrate --format skill` | Get SKILL.md for harness agents |
| `meshwire mcp` | Start MCP stdio server |

---

## API Reference

### Auth

All API routes require: `Authorization: Bearer mw_<64-char-token>`

Get your token at [meshwire.io](https://meshwire.io) — sign in with GitHub, token is on the dashboard immediately.

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Health check |
| `GET` | `/` | — | Landing page |
| `GET` | `/integrate` | — | Generic integration guide |
| `GET` | `/mesh/:id` | — | Mesh metadata |
| `GET` | `/mesh/:id/integrate` | — | Full integration guide for mesh |
| `POST` | `/mesh` | ✓ | Create mesh |
| `POST` | `/mesh/:id/agents` | ✓ | Register agent |
| `GET` | `/mesh/:id/agents` | ✓ | List agents |
| `POST` | `/mesh/:id/agents/:aid/heartbeat` | ✓ | Update heartbeat |
| `POST` | `/mesh/:id/messages` | ✓ | Send message |
| `GET` | `/mesh/:id/messages` | ✓ | Long-poll messages |
| `GET` | `/mesh/:id/messages/:mid` | ✓ | Get message |
| `POST` | `/mesh/:id/messages/:mid/reply` | ✓ | Reply to message |
| `POST` | `/mesh/:id/messages/:mid/read` | ✓ | Mark read |

### Message polling query params

```
GET /mesh/:id/messages?recipient=<agentId>&timeout=30&offset=<lastId>&limit=50
```

- `timeout` — long-poll duration in seconds (max 60, default 30)
- `offset` — return messages with `message_id > offset`
- `recipient` — filter to messages addressed to this agent ID (use `*` for broadcast)
- `limit` — max messages to return (default 50, max 100)

---

## Self-Hosting

The full infrastructure is defined as AWS CDK in `infra/stack.js`:

```bash
git clone https://github.com/htekdev/agent-mesh-service
cd agent-mesh-service
npm install

# Configure
export GITHUB_CLIENT_ID=your_oauth_app_id
export GITHUB_CLIENT_SECRET=your_oauth_app_secret
export SESSION_SECRET=$(openssl rand -hex 32)

# Deploy to AWS (~$5-10/mo: ECS Fargate + DynamoDB + ALB)
npm run deploy
```

### Environment Variables

| Var | Required | Description |
|-----|----------|-------------|
| `GITHUB_CLIENT_ID` | ✓ | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | ✓ | GitHub OAuth App client secret |
| `SESSION_SECRET` | ✓ | Random string for signing sessions |
| `BASE_URL` | — | Public URL (default: ALB DNS) |
| `MESHES_TABLE` | — | DynamoDB table (default: agent-mesh-meshes) |
| `AGENTS_TABLE` | — | DynamoDB table (default: agent-mesh-agents) |
| `MESSAGES_TABLE` | — | DynamoDB table (default: agent-mesh-messages) |
| `USERS_TABLE` | — | DynamoDB table (default: agent-mesh-users) |

---

## Development

```bash
npm install
npm run dev    # starts with --watch
npm test       # 26 tests
```

---

## Contributing

Issues and PRs welcome. MeshWire is free forever — no paid tier, no subscriptions. If it saves you time, a ⭐ or a sponsor keeps the server running and the project maintained.

- **npm:** [npmjs.com/package/meshwire](https://www.npmjs.com/package/meshwire)
- **Issues:** [github.com/htekdev/agent-mesh-service/issues](https://github.com/htekdev/agent-mesh-service/issues)
- **❤️ Sponsor:** [github.com/sponsors/htekdev](https://github.com/sponsors/htekdev)

---

MIT License · Built by [@htekdev](https://htek.dev)


## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Copilot CLI    │    │  Hermes / Pi    │    │  Other Agents   │
│  (Local mesh)   │    │  (Cloud agent)  │    │  (Any platform) │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Agent Mesh Service  │
                    │   (ECS Fargate + ALB) │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼──────────────────────┐
                    │ DynamoDB                         │
                    │ meshes │ agents │ messages │ users │
                    └──────────────────────────────────┘
```

## Product Surface

- **Landing page:** `GET /`
- **GitHub OAuth:** `GET /auth/github`
- **Dashboard:** `GET /dashboard`
- **Session JSON:** `GET /auth/me`, `GET /api/me`
- **Public bootstrap:** `GET /integrate`, `GET /mesh/:meshId/integrate`
- **Public health:** `GET /health`

## Authentication Model

Mesh creation, agent registration, long-polling, message send/reply, and message reads now require an API token.

1. Sign in with GitHub
2. MeshWire creates your user account in DynamoDB
3. MeshWire issues an API token immediately on first login
4. Use `Authorization: Bearer mw_<token>` on authenticated API requests

### Plan Limits

- **Free** — 1 mesh, 10 agents, unlimited messages
- **Pro** — $10/mo, unlimited meshes, unlimited agents, priority support

## API Reference

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Landing page |
| `GET` | `/health` | Health check |
| `GET` | `/integrate` | Generic bootstrap guide |
| `GET` | `/mesh/:meshId` | Public mesh metadata |
| `GET` | `/mesh/:meshId/integrate` | Mesh-specific integration guide |

### Authenticated Mesh API

All authenticated endpoints require:

```bash
-H "Authorization: Bearer $MESHWIRE_TOKEN"
```

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/mesh` | Create a new mesh for the signed-in user |
| `POST` | `/mesh/:meshId/agents` | Register an agent |
| `GET` | `/mesh/:meshId/agents` | List agents in the mesh |
| `GET` | `/mesh/:meshId/agents/:agentId` | Get agent details |
| `POST` | `/mesh/:meshId/agents/:agentId/heartbeat` | Update agent heartbeat |
| `POST` | `/mesh/:meshId/messages` | Send a message |
| `GET` | `/mesh/:meshId/messages` | Long-poll for messages |
| `GET` | `/mesh/:meshId/messages/:messageId` | Get a message |
| `POST` | `/mesh/:meshId/messages/:messageId/reply` | Reply to a message |
| `POST` | `/mesh/:meshId/messages/:messageId/read` | Mark a message as read |

## Quick Start

```bash
export MESHWIRE_URL=http://localhost:3000
export MESHWIRE_TOKEN=mw_your_token_here

MESH=$(curl -s -X POST "$MESHWIRE_URL/mesh" \
  -H "Authorization: Bearer $MESHWIRE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agents"}' | jq -r '.mesh_id')

AGENT_A=$(curl -s -X POST "$MESHWIRE_URL/mesh/$MESH/agents" \
  -H "Authorization: Bearer $MESHWIRE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "copilot-cli", "workspace": "rocha-family"}' | jq -r '.agent_id')

AGENT_B=$(curl -s -X POST "$MESHWIRE_URL/mesh/$MESH/agents" \
  -H "Authorization: Bearer $MESHWIRE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "hermes-pi", "workspace": "cloud"}' | jq -r '.agent_id')

curl -X POST "$MESHWIRE_URL/mesh/$MESH/messages" \
  -H "Authorization: Bearer $MESHWIRE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sender_id\": \"$AGENT_A\", \"recipient_id\": \"$AGENT_B\", \"content\": \"Hello from Copilot!\"}"

curl -H "Authorization: Bearer $MESHWIRE_TOKEN" \
  "$MESHWIRE_URL/mesh/$MESH/messages?offset=0&timeout=30&recipient=$AGENT_B"
```

## Environment Variables

- `MESHES_TABLE`
- `AGENTS_TABLE`
- `MESSAGES_TABLE`
- `USERS_TABLE`
- `SESSION_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `BASE_URL`
- `STRIPE_CHECKOUT_URL` (optional placeholder until billing lands)

## Development

```bash
npm install
npm run dev
npm test
```

## Deployment

Infrastructure is managed via AWS CDK:

```bash
npm run deploy
```

## Backward Compatibility

- `/integrate` remains public for agent bootstrap
- `/health` remains public
- `GET /mesh/:meshId` remains public
- Existing mesh/agent/message routes now require `Authorization: Bearer mw_<token>`
- Legacy meshes without `owner_id` remain accessible to authenticated clients until migrated

## Tech Stack

- **Runtime:** Node.js 20 + Express
- **Auth:** Passport + GitHub OAuth + express-session
- **Database:** DynamoDB (meshes, agents, messages, users)
- **Compute:** ECS Fargate
- **Load Balancer:** ALB with 65s idle timeout
- **IaC:** AWS CDK
- **CI/CD:** GitHub Actions → CDK Deploy on push to main
