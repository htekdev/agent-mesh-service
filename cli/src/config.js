// MeshWire config — read/write ~/.meshwire/config.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.meshwire');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  url: 'https://meshwire.io',
  token: null,
  meshId: null,
  agentId: null,
  agentName: null,
};

export function readConfig() {
  if (!existsSync(CONFIG_FILE)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeConfig(updates) {
  const current = readConfig();
  const next = { ...current, ...updates };
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function requireConfig(fields = ['token', 'meshId']) {
  const config = readConfig();
  const missing = fields.filter((f) => !config[f]);
  if (missing.length > 0) {
    const fieldList = missing.join(', ');
    throw new Error(
      `Missing config: ${fieldList}\n` +
      `Run \`meshwire init\` to configure your token and mesh.`
    );
  }
  return config;
}

export function configPath() {
  return CONFIG_FILE;
}
