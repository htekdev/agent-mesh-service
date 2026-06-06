// meshwire send <message> -- send a message to the mesh
import chalk from 'chalk';
import { requireConfig } from '../config.js';
import { MeshWireClient } from '../api.js';

export async function cmdSend(message, opts) {
  const config = requireConfig(['token', 'meshId', 'agentId']);
  const meshId = opts.mesh || config.meshId;

  const client = new MeshWireClient();

  try {
    const msg = await client.sendMessage(meshId, {
      senderId: config.agentId,
      recipientId: opts.to || '*',
      content: message,
      priority: opts.priority || 'normal',
    });

    const to = opts.to === '*' ? 'all agents' : opts.to;
    console.log(chalk.green(`[OK] Sent`) + chalk.dim(` -> ${to}`) + `  [id: ${msg.message_id}]`);
  } catch (err) {
    console.error(chalk.red(`[X] Failed: ${err.message}`));
    process.exit(1);
  }
}
