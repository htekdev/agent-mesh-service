/**
 * In-memory mock data store for test mode.
 * When MOCK_AUTH=true and NODE_ENV=test, the API routes use this
 * instead of DynamoDB so E2E tests can run without AWS credentials.
 */

const meshes = new Map();
const agents = new Map();

export function isMockDataEnabled() {
  return process.env.MOCK_AUTH === "true" && process.env.NODE_ENV === "test";
}

export function mockCreateMesh(mesh) {
  meshes.set(mesh.mesh_id, mesh);
  return mesh;
}

export function mockListMeshesByOwner(ownerId) {
  return [...meshes.values()].filter((m) => m.owner_id === ownerId);
}

export function mockGetMesh(meshId) {
  return meshes.get(meshId) || null;
}

export function mockListAgents(meshId) {
  return [...(agents.get(meshId) || [])];
}

export function mockCountMeshesByOwner(ownerId) {
  return mockListMeshesByOwner(ownerId).length;
}

export function resetMockData() {
  meshes.clear();
  agents.clear();
}
