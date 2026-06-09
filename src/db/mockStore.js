/**
 * In-memory mock data store for test mode.
 * When MOCK_AUTH=true and NODE_ENV=test, the API routes use this
 * instead of DynamoDB so E2E tests can run without AWS credentials.
 */

const meshes = new Map();
const agents = new Map(); // key: meshId, value: Map<agentId, agent>
const messages = new Map(); // key: meshId, value: array of messages

export function isMockDataEnabled() {
  return process.env.MOCK_AUTH === "true" && process.env.NODE_ENV === "test";
}

// --- Meshes ---

export function mockCreateMesh(mesh) {
  meshes.set(mesh.mesh_id, mesh);
  return mesh;
}

export function mockGetMesh(meshId) {
  return meshes.get(meshId) || null;
}

export function mockListMeshesByOwner(ownerId) {
  return [...meshes.values()].filter((m) => m.owner_id === ownerId);
}

export function mockCountMeshesByOwner(ownerId) {
  return mockListMeshesByOwner(ownerId).length;
}

// --- Agents ---

export function mockRegisterAgent(agent) {
  const meshId = agent.mesh_id;
  if (!agents.has(meshId)) agents.set(meshId, new Map());
  agents.get(meshId).set(agent.agent_id, agent);
  return agent;
}

export function mockGetAgent(meshId, agentId) {
  return agents.get(meshId)?.get(agentId) || null;
}

export function mockListAgents(meshId) {
  if (!agents.has(meshId)) return [];
  return [...agents.get(meshId).values()];
}

export function mockUpdateAgentHeartbeat(meshId, agentId) {
  const agent = agents.get(meshId)?.get(agentId);
  if (agent) {
    agent.last_seen = new Date().toISOString();
    agent.status = "active";
  }
}

// --- Messages ---

export function mockCreateMessage(message) {
  const meshId = message.mesh_id;
  if (!messages.has(meshId)) messages.set(meshId, []);
  messages.get(meshId).push(message);
  return message;
}

export function mockGetMessage(meshId, messageId) {
  const list = messages.get(meshId) || [];
  return list.find((m) => m.message_id === messageId) || null;
}

export function mockQueryMessages(meshId, { recipientId, offset = 0, limit = 50 } = {}) {
  let list = messages.get(meshId) || [];
  list = list.filter((m) => m.message_id > offset);
  if (recipientId) {
    list = list.filter((m) => m.recipient_id === recipientId || m.recipient_id === "*");
  }
  return list.slice(0, limit);
}

export function mockMarkMessageRead(meshId, messageId) {
  const msg = mockGetMessage(meshId, messageId);
  if (msg) msg.read_at = new Date().toISOString();
}

// --- Reset ---

export function resetMockData() {
  meshes.clear();
  agents.clear();
  messages.clear();
}
