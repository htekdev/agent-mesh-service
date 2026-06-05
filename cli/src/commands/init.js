// meshwire init — configure token, URL, and mesh. Supports --harness for harness-specific setup.
import chalk from 'chalk';
import { createInterface } from 'readline/promises';
import { writeConfig, readConfig } from '../config.js';
import { MeshWireClient } from '../api.js';
import { resolveToken, resolveMeshId, readCredentials, writeCredentials } from '../auth.js';

const MESHWIRE_URL = 'https://meshwire.io';

function prompt(rl, question, defaultVal) {
  const hint = defaultVal ? chalk.dim(` (${defaultVal})`) : '';
  return rl.question(`  ${question}${hint}: `).then((v) => v.trim() || defaultVal || '');
}

export async function cmdInit(opts) {
  // ── Harness-specific setup ────────────────────────────────────────────────
  if (opts.harness) {
    const harness = opts.harness.toLowerCase();
    const config = readConfig();
    const meshId = opts.mesh || resolveMeshId();
    const token = opts.token || resolveToken();
    const url = opts.url || config.url || MESHWIRE_URL;

    switch (harness) {
      case 'copilot': {
        const { setupCopilot } = await import('../harness/copilot.js');
        await setupCopilot({ meshId, agentName: opts.agent, meshwireUrl: url, workspaceName: opts.workspace });
        return;
      }
      case 'claude':
      case 'cursor': {
        const { setupClaude } = await import('../harness/claude.js');
        await setupClaude({ meshId, agentName: opts.agent, meshwireUrl: url, workspaceName: opts.workspace });
        return;
      }
      case 'hermes': {
        const { setupHermes } = await import('../harness/hermes.js');
        await setupHermes({ meshId, agentName: opts.agent, meshwireUrl: url, workspaceName: opts.workspace });
        return;
      }
      default:
        console.error(chalk.red(`  Unknown harness: ${harness}`));
        console.error(chalk.dim('  Supported: copilot, claude, cursor, hermes\n'));
        process.exit(1);
    }
  }

  console.log('\n' + chalk.bold('🕸  MeshWire Setup') + '\n');

  // Auto-detect existing token from credentials or env
  const detectedToken = resolveToken();
  const detectedMesh = resolveMeshId();

  if (detectedToken && !opts.token) {
    const creds = readCredentials();
    console.log(chalk.dim(`  Found credentials for ${creds?.login || 'your account'}`));
    console.log(chalk.dim(`  Token: mw_••••••••${detectedToken.slice(-6)}`));
    if (detectedMesh) {
      console.log(chalk.dim(`  Mesh:  ${detectedMesh}`));
    }
    console.log('');
  }

  // If token + mesh passed via flags, use them directly
  if (opts.token && opts.mesh) {
    const config = writeConfig({
      token: opts.token,
      url: opts.url || MESHWIRE_URL,
      meshId: opts.mesh,
    });
    writeCredentials({ token: opts.token, defaultMeshId: opts.mesh, savedAt: new Date().toISOString() });
    printSuccess(config);
    return;
  }

  const existing = readConfig();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // Suggest login if no credentials found
    if (!detectedToken) {
      console.log(chalk.dim(`  No credentials found. Run ${chalk.cyan('meshwire login')} for browser auth,`));
      console.log(chalk.dim(`  or get your token at: ${MESHWIRE_URL}/dashboard\n`));
    }

    const token = opts.token || detectedToken || await prompt(rl, 'API token (mw_...)', existing.token);
    if (!token || !token.startsWith('mw_')) {
      console.error(chalk.red('\n  Token must start with mw_'));
      console.error(chalk.dim(`  Run 'meshwire login' or sign in at ${MESHWIRE_URL}.\n`));
      process.exit(1);
    }

    const url = opts.url || await prompt(rl, 'MeshWire URL', existing.url || MESHWIRE_URL);
    const client = new MeshWireClient({ url, token });

    // Verify token works
    process.stdout.write(chalk.dim('  Verifying token...'));
    try {
      await client.health();
      process.stdout.write(' ' + chalk.green('✓') + '\n');
    } catch {
      process.stdout.write(' ' + chalk.red('connection failed') + '\n');
      console.error(chalk.red(`  Cannot reach ${url} — check your URL and try again.\n`));
      process.exit(1);
    }

    // Get or create mesh
    let meshId = opts.mesh || existing.meshId;
    if (!meshId) {
      console.log(chalk.dim('\n  Creating your first mesh...'));
      const meshName = await prompt(rl, 'Mesh name', 'my-mesh');
      const mesh = await client.createMesh(meshName);
      meshId = mesh.mesh_id;
      console.log(chalk.green(`  ✓ Created mesh: ${meshId}`));
    } else {
      console.log(chalk.dim(`\n  Using existing mesh: ${meshId}`));
    }

    // Register as an agent
    const agentName = await prompt(rl, 'Your agent name', existing.agentName || 'local-agent');
    process.stdout.write(chalk.dim('  Registering agent...'));
    const agent = await client.registerAgent(meshId, {
      name: agentName,
      description: 'Local CLI agent',
      workspace: process.env.COMPUTERNAME || process.env.HOSTNAME || 'local',
    });
    process.stdout.write(' ' + chalk.green('✓') + '\n');

    const config = writeConfig({ token, url, meshId, agentId: agent.agent_id, agentName });
    printSuccess(config);
  } finally {
    rl.close();
  }
}

function printSuccess(config) {
  console.log('\n' + chalk.bold.green('  ✅ MeshWire configured!\n'));
  console.log(chalk.dim('  Config saved to ~/.meshwire/config.json\n'));
  console.log(`  ${chalk.bold('Mesh:')}   ${config.meshId}`);
  console.log(`  ${chalk.bold('Agent:')}  ${config.agentId || '(not registered)'}`);
  console.log(`  ${chalk.bold('URL:')}    ${config.url}`);
  console.log('\n' + chalk.dim('  Next steps:'));
  console.log(chalk.cyan('    meshwire status') + chalk.dim('                    — check connection'));
  console.log(chalk.cyan('    meshwire listen') + chalk.dim('                    — watch for messages'));
  console.log(chalk.cyan('    meshwire send "hello"') + chalk.dim('              — send your first message'));
  console.log(chalk.cyan('    meshwire init --harness copilot') + chalk.dim('   — set up Copilot CLI extension'));
  console.log(chalk.cyan('    meshwire init --harness claude') + chalk.dim('    — set up Claude Desktop MCP'));
  console.log(chalk.cyan('    meshwire init --harness hermes') + chalk.dim('    — set up Hermes integration'));
  console.log(chalk.cyan('    meshwire integrate') + chalk.dim('                — get full API guide\n'));
}
