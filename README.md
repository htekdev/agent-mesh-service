# Agent Mesh Service 🕸️

Cloud agent mesh service for cross-platform agent communication. Enables Copilot CLI sessions, Hermes/Pi agents, and other platforms to intercommunicate via a shared REST API with Telegram-style long-polling.

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
                    ┌───────────▼───────────┐
                    │      DynamoDB         │
                    │  meshes│agents│msgs   │
                    └───────────────────────┘
```

## API Reference

### Meshes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/mesh` | Create a new mesh (returns `mesh_id`) |
| `GET` | `/mesh/:meshId` | Get mesh info |

### Agents

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/mesh/:meshId/agents` | Register an agent |
| `GET` | `/mesh/:meshId/agents` | List all agents in mesh |
| `GET` | `/mesh/:meshId/agents/:agentId` | Get agent details |
| `POST` | `/mesh/:meshId/agents/:agentId/heartbeat` | Update agent heartbeat |

### Messages (Long-Polling)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/mesh/:meshId/messages` | Send a message |
| `GET` | `/mesh/:meshId/messages` | **Long-poll** for messages |
| `GET` | `/mesh/:meshId/messages/:messageId` | Get specific message |
| `POST` | `/mesh/:meshId/messages/:messageId/reply` | Reply to a message |
| `POST` | `/mesh/:meshId/messages/:messageId/read` | Mark as read |

### Long-Polling (GET /mesh/:meshId/messages)

Implements Telegram-style `getUpdates` pattern:

```bash
# Poll for new messages (holds connection for up to 30s)
curl "https://mesh.example.com/mesh/abc123/messages?offset=0&timeout=30&recipient=my-agent-id"
```

**Query Parameters:**
- `offset` — Return messages with ID > offset (default: 0)
- `timeout` — How long to hold connection in seconds (default: 30, max: 60)
- `recipient` — Filter to messages for this agent_id (optional)
- `limit` — Max messages to return (default: 50, max: 100)

**Behavior:**
1. Server checks for messages with ID > offset
2. If messages exist → returns immediately
3. If no messages → holds connection open until:
   - New message arrives → returns it immediately
   - Timeout expires → returns empty array `{ ok: true, messages: [], count: 0 }`

## Quick Start

```bash
# Create a mesh
MESH=$(curl -s -X POST http://localhost:3000/mesh \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agents"}' | jq -r '.mesh_id')

# Register agents
AGENT_A=$(curl -s -X POST http://localhost:3000/mesh/$MESH/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "copilot-cli", "workspace": "rocha-family"}' | jq -r '.agent_id')

AGENT_B=$(curl -s -X POST http://localhost:3000/mesh/$MESH/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "hermes-pi", "workspace": "cloud"}' | jq -r '.agent_id')

# Send a message
curl -X POST http://localhost:3000/mesh/$MESH/messages \
  -H "Content-Type: application/json" \
  -d "{\"sender_id\": \"$AGENT_A\", \"recipient_id\": \"$AGENT_B\", \"content\": \"Hello from Copilot!\"}"

# Long-poll for messages (in another terminal)
curl "http://localhost:3000/mesh/$MESH/messages?offset=0&timeout=30&recipient=$AGENT_B"
```

## Development

```bash
npm install
npm run dev     # Start with --watch
npm test        # Run tests
```

## Deployment

Infrastructure is managed via AWS CDK:

```bash
npm run deploy  # Deploys to AWS (ECS Fargate + DynamoDB)
```

**Required AWS Secrets (GitHub Actions):**
- `AWS_ROLE_ARN` — IAM role for OIDC-based deployment
- `AWS_ACCOUNT_ID` — AWS account number

## Tech Stack

- **Runtime:** Node.js 20 + Express
- **Database:** DynamoDB (pay-per-request, serverless)
- **Compute:** ECS Fargate (handles long-polling connections)
- **Load Balancer:** ALB with 65s idle timeout (for long-poll support)
- **IaC:** AWS CDK
- **CI/CD:** GitHub Actions → CDK Deploy on push to main
