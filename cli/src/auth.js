// MeshWire credential resolution — reads from multiple sources in priority order
//
// Priority: credentials.json > MESHWIRE_TOKEN env > .mesh.json > config.json > null
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { readConfig } from './config.js';
import { readMeshJson } from './mesh-schema.js';

const CREDS_DIR = join(homedir(), '.meshwire');
const CREDS_FILE = join(CREDS_DIR, 'credentials.json');

export function readCredentials() {
  if (!existsSync(CREDS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CREDS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export function writeCredentials(data) {
  mkdirSync(CREDS_DIR, { recursive: true });
  writeFileSync(CREDS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// Resolve token from all sources in priority order
export function resolveToken() {
  // 1. credentials.json
  const creds = readCredentials();
  if (creds?.token) return creds.token;

  // 2. Environment variable
  if (process.env.MESHWIRE_TOKEN) return process.env.MESHWIRE_TOKEN;

  // 3. Legacy config.json
  const config = readConfig();
  if (config.token) return config.token;

  return null;
}

// Resolve mesh ID — workspace .mesh.json takes precedence (it's repo-specific)
export function resolveMeshId() {
  // 1. Workspace .mesh.json
  const meshJson = readMeshJson();
  if (meshJson?.mesh_id) return meshJson.mesh_id;

  // 2. credentials.json default mesh
  const creds = readCredentials();
  if (creds?.defaultMeshId) return creds.defaultMeshId;

  // 3. Environment variable
  if (process.env.MESHWIRE_MESH_ID) return process.env.MESHWIRE_MESH_ID;

  // 4. Legacy config.json
  const config = readConfig();
  if (config.meshId) return config.meshId;

  return null;
}

export function resolveAgentName() {
  const meshJson = readMeshJson();
  if (meshJson?.agent_name) return meshJson.agent_name;

  const config = readConfig();
  return config.agentName || 'meshwire-agent';
}

export function resolveUrl() {
  if (process.env.MESHWIRE_URL) return process.env.MESHWIRE_URL;
  const config = readConfig();
  return config.url || 'https://meshwire.io';
}
