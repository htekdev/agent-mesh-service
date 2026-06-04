# Agent Mesh Service 🕸️

Cloud agent mesh service for cross-platform agent communication. MeshWire adds GitHub OAuth, user accounts, API tokens, plan enforcement, and a hosted landing page/dashboard on top of the existing long-poll mesh API.

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
