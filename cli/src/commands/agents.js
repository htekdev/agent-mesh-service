// meshwire agents -- list agents in the mesh
import chalk from 'chalk';
import { requireConfig } from '../config.js';
import { MeshWireClient } from '../api.js';

export async function cmdAgents(opts) {
  const config = requireConfig(['token', 'meshId']);
  const meshId = opts.mesh || config.meshId;
  const client = new MeshWireClient();

  try {
    const { agents, count } = await client.listAgents(meshId);

    if (opts.json) {
      console.log(JSON.stringify({ agents, count }, null, 2));
      return;
    }

    console.log('\n' + chalk.bold(`🕸  Agents in mesh ${meshId}`) + chalk.dim(` (${count})\n`));

    if (count === 0) {
      console.log(chalk.dim('  No agents registered yet.\n'));
      return;
    }

    for (const agent of agents) {
      const status = agent.status === 'active'
        ? chalk.green('● active')
        : chalk.dim('○ inactive');
      const lastSeen = agent.last_seen
        ? chalk.dim(`  last seen ${timeAgo(agent.last_seen)}`)
        : '';
      const isMe = agent.agent_id === config.agentId ? chalk.cyan(' (you)') : '';

      console.log(`  ${status}  ${chalk.bold(agent.name)}${isMe}  ${chalk.dim(agent.agent_id)}${lastSeen}`);
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }
}

function timeAgo(isoString) {
  const ms = Date.now() - new Date(isoString).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}
