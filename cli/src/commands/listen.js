// meshwire listen — long-poll for incoming messages, print them as they arrive
import chalk from 'chalk';
import { requireConfig, writeConfig } from '../config.js';
import { MeshWireClient } from '../api.js';

export async function cmdListen(opts) {
  const config = requireConfig(['token', 'meshId']);
  const meshId = opts.mesh || config.meshId;
  const timeout = parseInt(opts.timeout || '30', 10);
  const client = new MeshWireClient();

  // Auto-register if we don't have an agent ID yet
  let agentId = opts.agent || config.agentId;
  if (!agentId) {
    try {
      const agent = await client.registerAgent(meshId, {
        name: config.agentName || 'meshwire-cli',
        description: 'MeshWire CLI listener',
        workspace: process.env.COMPUTERNAME || process.env.HOSTNAME || 'local',
      });
      agentId = agent.agent_id;
      writeConfig({ agentId, agentName: agent.name });
      console.log(chalk.dim(`  Registered as agent: ${agent.name} (${agentId})`));
    } catch (err) {
      console.error(chalk.red(`  Could not register agent: ${err.message}`));
      process.exit(1);
    }
  }

  console.log(
    '\n' + chalk.bold('🕸  MeshWire') + chalk.dim(` listening on mesh ${meshId}`) + '\n' +
    chalk.dim(`  Agent: ${config.agentName || agentId} (${agentId})`) + '\n' +
    chalk.dim('  Press Ctrl+C to stop\n')
  );

  let offset = 0;
  let hbInterval;

  // Heartbeat every 20s to stay active
  hbInterval = setInterval(async () => {
    try { await client.heartbeat(meshId, agentId); } catch { /* ignore */ }
  }, 20_000);

  process.on('SIGINT', () => {
    clearInterval(hbInterval);
    console.log('\n' + chalk.dim('  Disconnected.') + '\n');
    process.exit(0);
  });

  // Long-poll loop
  while (true) {
    try {
      const { messages } = await client.pollMessages(meshId, {
        recipientId: agentId,
        offset,
        timeout,
      });

      for (const msg of messages) {
        if (msg.message_id > offset) offset = msg.message_id;
        printMessage(msg, opts.raw);
      }
    } catch (err) {
      if (err.message?.includes('ECONNREFUSED') || err.message?.includes('ENOTFOUND')) {
        console.error(chalk.red('  Connection lost. Retrying in 5s...'));
        await sleep(5000);
      } else {
        console.error(chalk.dim(`  Poll error: ${err.message} — retrying...`));
        await sleep(2000);
      }
    }
  }
}

function printMessage(msg, raw) {
  if (raw) {
    console.log(JSON.stringify(msg));
    return;
  }

  const time = new Date(msg.created_at).toLocaleTimeString();
  const from = msg.sender_id;
  const priority = msg.priority === 'urgent' ? chalk.red('[urgent] ') :
                   msg.priority === 'high'   ? chalk.yellow('[high] ') : '';

  console.log(
    chalk.dim(time) + '  ' +
    chalk.cyan(from) + chalk.dim(' → ') +
    chalk.dim(msg.recipient_id === '*' ? 'all' : msg.recipient_id) + '\n' +
    '  ' + priority + msg.content + '\n'
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
