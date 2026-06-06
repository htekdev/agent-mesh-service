// Hermes / generic harness setup
// Writes a skill document + env file for Hermes (Pi) and other harnesses

import { writeFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { writeMeshJson, readMeshJson } from '../mesh-schema.js';
import { readCredentials } from '../auth.js';
import { MeshWireClient } from '../api.js';

export async function setupHermes({ meshId, agentName, meshwireUrl, workspaceName }) {
  console.log('\n' + chalk.bold('[*]  Setting up Hermes / generic harness') + '\n');

  const creds = readCredentials();
  if (!creds?.token) {
    console.error(chalk.red('  [X] Not authenticated. Run `meshwire login` first.\n'));
    process.exit(1);
  }

  const existing = readMeshJson() || {};
  const meshJsonData = {
    mesh_id: meshId || existing.mesh_id,
    workspace_name: workspaceName || existing.workspace_name || 'hermes',
    agent_name: agentName || existing.agent_name || 'hermes-agent',
    harness: 'hermes',
  };

  if (!meshJsonData.mesh_id) {
    console.error(chalk.red('  [X] No mesh ID. Run `meshwire mesh create` first.\n'));
    process.exit(1);
  }

  writeMeshJson(meshJsonData);
  console.log(chalk.green('  [OK] .mesh.json written'));

  // Write a .env.meshwire file for Hermes to source
  const envContent = [
    `MESHWIRE_TOKEN=${creds.token}`,
    `MESHWIRE_URL=${meshwireUrl || 'https://meshwire.io'}`,
    `MESHWIRE_MESH_ID=${meshJsonData.mesh_id}`,
    `MESHWIRE_AGENT_NAME=${meshJsonData.agent_name}`,
    '',
  ].join('\n');

  writeFileSync(join(process.cwd(), '.env.meshwire'), envContent, 'utf8');
  console.log(chalk.green('  [OK] .env.meshwire written'));

  // Write skill document
  const skillContent = `# MeshWire Skill -- ${meshJsonData.workspace_name}

## Mesh
\`\`\`
MESH_ID=${meshJsonData.mesh_id}
AGENT_NAME=${meshJsonData.agent_name}
BASE_URL=${meshwireUrl || 'https://meshwire.io'}
\`\`\`

## Quick commands

### Send message
\`\`\`bash
curl -sX POST $MESHWIRE_URL/mesh/${meshJsonData.mesh_id}/messages \\
  -H "Authorization: Bearer $MESHWIRE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"sender_id":"YOUR_AGENT_ID","content":"hello","recipient_id":"*"}'
\`\`\`

### Poll messages
\`\`\`bash
curl -s "$MESHWIRE_URL/mesh/${meshJsonData.mesh_id}/messages?timeout=30&offset=0" \\
  -H "Authorization: Bearer $MESHWIRE_TOKEN"
\`\`\`

### List agents
\`\`\`bash
curl -s "$MESHWIRE_URL/mesh/${meshJsonData.mesh_id}/agents" \\
  -H "Authorization: Bearer $MESHWIRE_TOKEN"
\`\`\`
`;

  writeFileSync(join(process.cwd(), 'MESHWIRE_SKILL.md'), skillContent, 'utf8');
  console.log(chalk.green('  [OK] MESHWIRE_SKILL.md written'));

  // Register agent
  try {
    const client = new MeshWireClient({ url: meshwireUrl, token: creds.token, meshId: meshJsonData.mesh_id });
    const agent = await client.registerAgent(meshJsonData.mesh_id, {
      name: meshJsonData.agent_name,
      description: 'Hermes agent',
      workspace: meshJsonData.workspace_name,
      metadata: { platform: 'hermes', harness: 'meshwire' },
    });
    console.log(chalk.green(`  [OK] Registered as ${agent.name} (${agent.agent_id})`));
  } catch (err) {
    console.log(chalk.yellow(`  [!] ${err.message}`));
  }

  console.log('\n' + chalk.bold.green('  [OK] Hermes harness ready!\n'));
  console.log(chalk.dim('  Source .env.meshwire in your Hermes startup script.'));
  console.log(chalk.dim('  Drop MESHWIRE_SKILL.md into your agent context.\n'));
}
