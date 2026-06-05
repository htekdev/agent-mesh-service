// MeshWire CLI — main entry, command dispatch
import { Command } from 'commander';
import chalk from 'chalk';

import { cmdInit } from './commands/init.js';
import { cmdStatus } from './commands/status.js';
import { cmdSend } from './commands/send.js';
import { cmdListen } from './commands/listen.js';
import { cmdAgents } from './commands/agents.js';
import { cmdMesh } from './commands/mesh.js';
import { cmdIntegrate } from './commands/integrate.js';
import { cmdLogin } from './commands/login.js';
import { cmdMcp } from './mcp/server.js';

export async function run(version) {
  const program = new Command();

  program
    .name('meshwire')
    .description(
      chalk.bold('🕸  MeshWire') +
      ' — Wire your agents together.\n' +
      chalk.dim('  Multi-agent messaging infrastructure. meshwire.io')
    )
    .version(version, '-v, --version');

  // ─── meshwire login ──────────────────────────────────────────────
  program
    .command('login')
    .description('Sign in with GitHub — saves credentials to ~/.meshwire/credentials.json')
    .option('--url <url>', 'MeshWire URL', 'https://meshwire.io')
    .option('--force', 'Re-authenticate even if already signed in')
    .option('--skip-mesh', 'Skip mesh setup prompt after login')
    .action(cmdLogin);

  // ─── meshwire init ───────────────────────────────────────────────
  program
    .command('init')
    .description('Configure MeshWire with your API token and mesh')
    .option('--token <token>', 'API token (mw_...)')
    .option('--url <url>', 'MeshWire API URL', 'https://meshwire.io')
    .option('--mesh <meshId>', 'Mesh ID to connect to')
    .option(
      '--harness <name>',
      'Set up for a specific harness: copilot | claude | hermes | cursor',
    )
    .option('--agent <name>', 'Agent name for harness setup')
    .option('--workspace <name>', 'Workspace name for .mesh.json')
    .action(cmdInit);

  // ─── meshwire status ─────────────────────────────────────────────
  program
    .command('status')
    .description('Show current configuration and connection health')
    .action(cmdStatus);

  // ─── meshwire send ───────────────────────────────────────────────
  program
    .command('send <message>')
    .description('Send a message to the mesh')
    .option('-t, --to <agentId>', 'Recipient agent ID (default: broadcast to all)', '*')
    .option('-m, --mesh <meshId>', 'Mesh ID (overrides config)')
    .option('-p, --priority <level>', 'Priority: urgent|high|normal|low', 'normal')
    .action(cmdSend);

  // ─── meshwire listen ─────────────────────────────────────────────
  program
    .command('listen')
    .description('Poll for incoming messages (runs continuously)')
    .option('-m, --mesh <meshId>', 'Mesh ID (overrides config)')
    .option('-a, --agent <agentId>', 'Filter messages for this agent ID')
    .option('--raw', 'Output raw JSON instead of formatted messages')
    .option('--timeout <seconds>', 'Long-poll timeout per request', '30')
    .action(cmdListen);

  // ─── meshwire agents ─────────────────────────────────────────────
  program
    .command('agents')
    .description('List agents registered in the mesh')
    .option('-m, --mesh <meshId>', 'Mesh ID (overrides config)')
    .option('--json', 'Output raw JSON')
    .action(cmdAgents);

  // ─── meshwire mesh ───────────────────────────────────────────────
  const mesh = program
    .command('mesh')
    .description('Manage meshes');

  mesh
    .command('create [name]')
    .description('Create a new mesh')
    .action((name) => cmdMesh('create', { name }));

  mesh
    .command('list')
    .description('List your meshes (requires dashboard session)')
    .action(() => cmdMesh('list', {}));

  mesh
    .command('use <meshId>')
    .description('Set the active mesh in your config')
    .action((meshId) => cmdMesh('use', { meshId }));

  // ─── meshwire integrate ──────────────────────────────────────────
  program
    .command('integrate')
    .description('Print the full integration guide for your mesh')
    .option('-m, --mesh <meshId>', 'Mesh ID (overrides config)')
    .option('-f, --format <fmt>', 'Output format: all|tools|skill|openapi', 'all')
    .option('--json', 'Output raw JSON')
    .action(cmdIntegrate);

  // ─── meshwire mcp ────────────────────────────────────────────────
  program
    .command('mcp')
    .description('Start an MCP stdio server (for Copilot CLI and MCP-compatible agents)')
    .option('-m, --mesh <meshId>', 'Mesh ID to bind to')
    .option('-a, --agent <name>', 'Agent name to register as')
    .action(cmdMcp);

  // ─── Global error handling ───────────────────────────────────────
  program.exitOverride();

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
      process.exit(0);
    }
    if (err.code === 'commander.unknownCommand') {
      console.error(chalk.red(`Unknown command: ${err.message}`));
      console.error(chalk.dim('Run `meshwire --help` to see available commands.'));
      process.exit(1);
    }
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  }
}
