// Claude Desktop / Cursor harness setup
// Generates MCP server config at ~/Library/Application Support/Claude/claude_desktop_config.json
// (macOS) or %APPDATA%\Claude\claude_desktop_config.json (Windows)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import { writeMeshJson, readMeshJson } from '../mesh-schema.js';
import { readCredentials } from '../auth.js';
import { MeshWireClient } from '../api.js';

function getClaudeConfigPath() {
  if (platform() === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  }
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  return join(homedir(), '.config', 'claude', 'claude_desktop_config.json');
}

export async function setupClaude({ meshId, agentName, meshwireUrl, workspaceName }) {
  console.log('\n' + chalk.bold('[*]  Setting up Claude Desktop / Cursor harness') + '\n');

  const creds = readCredentials();
  if (!creds?.token) {
    console.error(chalk.red('  [X] Not authenticated. Run `meshwire login` first.\n'));
    process.exit(1);
  }

  // 1. Write .mesh.json
  const existing = readMeshJson() || {};
  const meshJsonData = {
    mesh_id: meshId || existing.mesh_id,
    workspace_name: workspaceName || existing.workspace_name || process.cwd().split(/[/\\]/).pop(),
    agent_name: agentName || existing.agent_name || 'claude-agent',
    harness: 'claude',
  };

  if (!meshJsonData.mesh_id) {
    console.error(chalk.red('  [X] No mesh ID. Run `meshwire mesh create` first.\n'));
    process.exit(1);
  }

  writeMeshJson(meshJsonData);
  console.log(chalk.green('  [OK] .mesh.json written'));

  // 2. Update Claude Desktop config
  const configPath = getClaudeConfigPath();
  let config = {};
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, 'utf8')); } catch { config = {}; }
  }

  config.mcpServers = config.mcpServers || {};
  config.mcpServers.meshwire = {
    command: 'npx',
    args: ['meshwire', 'mcp', '--mesh', meshJsonData.mesh_id, '--agent', meshJsonData.agent_name],
    env: {
      MESHWIRE_TOKEN: creds.token,
      MESHWIRE_URL: meshwireUrl || 'https://meshwire.io',
    },
  };

  mkdirSync(join(configPath, '..'), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log(chalk.green(`\n  [OK] Claude Desktop config updated`));
  console.log(chalk.dim(`    ${configPath}`));

  // 3. Register agent
  try {
    const client = new MeshWireClient({ url: meshwireUrl, token: creds.token, meshId: meshJsonData.mesh_id });
    const agent = await client.registerAgent(meshJsonData.mesh_id, {
      name: meshJsonData.agent_name,
      description: 'Claude Desktop / Cursor agent',
      workspace: meshJsonData.workspace_name,
      metadata: { platform: 'claude', harness: 'meshwire' },
    });
    console.log(chalk.green(`  [OK] Registered as ${agent.name} (${agent.agent_id})`));
  } catch (err) {
    console.log(chalk.yellow(`  [!] ${err.message}`));
  }

  console.log('\n' + chalk.bold.green('  [OK] Claude harness ready!\n'));
  console.log(chalk.dim('  Restart Claude Desktop to load the MeshWire MCP server.'));
  console.log(chalk.dim('  MCP tools: meshwire_send_message, meshwire_get_messages, meshwire_list_agents\n'));
}
