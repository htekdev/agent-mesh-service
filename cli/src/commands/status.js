// meshwire status -- show config + live connection check
import chalk from 'chalk';
import { readConfig } from '../config.js';
import { MeshWireClient } from '../api.js';

export async function cmdStatus() {
  const config = readConfig();

  console.log('\n' + chalk.bold('*  MeshWire Status') + '\n');

  if (!config.token) {
    console.log(chalk.yellow('  Not configured.'));
    console.log(chalk.dim('  Run `meshwire init` to set up your token and mesh.\n'));
    process.exit(0);
  }

  // Print config
  console.log(chalk.dim('  Configuration:'));
  console.log(`    Token   : ${maskToken(config.token)}`);
  console.log(`    URL     : ${config.url}`);
  console.log(`    Mesh    : ${config.meshId || chalk.yellow('not set')}`);
  console.log(`    Agent   : ${config.agentId ? `${config.agentName} (${config.agentId})` : chalk.yellow('not registered')}`);

  // Live checks
  console.log('\n' + chalk.dim('  Connection:'));
  const client = new MeshWireClient();

  try {
    const health = await client.health();
    console.log(`    Service : ${chalk.green('[OK] online')}  (${health.timestamp})`);
  } catch (err) {
    console.log(`    Service : ${chalk.red('[X] unreachable')} -- ${err.message}`);
    process.exit(1);
  }

  if (config.meshId) {
    try {
      const mesh = await client.getMesh(config.meshId);
      console.log(`    Mesh    : ${chalk.green('[OK] exists')}  "${mesh.name}"`);
    } catch {
      console.log(`    Mesh    : ${chalk.red('[X] not found')}`);
    }
  }

  if (config.meshId) {
    try {
      const { agents, count } = await client.listAgents(config.meshId);
      const active = agents.filter((a) => a.status === 'active').length;
      console.log(`    Agents  : ${chalk.cyan(count)} registered, ${chalk.green(active)} active`);
    } catch {
      console.log(`    Agents  : ${chalk.yellow('could not fetch')}`);
    }
  }

  console.log('');
}

function maskToken(token) {
  if (!token) return chalk.dim('none');
  return chalk.dim(token.slice(0, 6)) + chalk.dim('************') + chalk.dim(token.slice(-6));
}
