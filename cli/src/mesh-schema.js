// .mesh.json — workspace-level mesh config
// Lives in the repo root. Defines which mesh this workspace participates in.
//
// Schema:
// {
//   "mesh_id": "kR9xQpLmW3aZ",          — which mesh this workspace joins
//   "workspace_name": "rocha-family",    — human label for this workspace
//   "agent_name": "copilot-assistant",   — how this agent appears in the mesh
//   "harness": "copilot"                 — which harness drives this workspace
// }

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const MESH_JSON_FILE = '.mesh.json';

export function readMeshJson(cwd = process.cwd()) {
  const file = join(cwd, MESH_JSON_FILE);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writeMeshJson(data, cwd = process.cwd()) {
  const file = join(cwd, MESH_JSON_FILE);
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function meshJsonExists(cwd = process.cwd()) {
  return existsSync(join(cwd, MESH_JSON_FILE));
}

export const MESH_JSON_SCHEMA = {
  mesh_id: 'string — which mesh this workspace connects to',
  workspace_name: 'string — human-readable label for this workspace',
  agent_name: 'string — how this agent appears in the mesh',
  harness: 'string — copilot | claude | hermes | cursor | raw',
};
