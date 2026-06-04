// meshwire mesh — create, list, switch meshes
import chalk from 'chalk';
import { requireConfig, writeConfig, readConfig } from '../config.js';
import { MeshWireClient } from '../api.js';

export async function cmdMesh(subcommand, opts) {
  const client = new MeshWireClient();

  switch (subcommand) {
    case 'create': {
      requireConfig(['token']);
      const name = opts.name || `mesh-${Date.now()}`;
      try {
        const mesh = await client.createMesh(name);
        console.log(chalk.green(`✓ Created mesh: ${mesh.mesh_id}`) + chalk.dim(` "${mesh.name}"`));
        console.log(chalk.dim(`  Run \`meshwire mesh use ${mesh.mesh_id}\` to activate it.`));
      } catch (err) {
        console.error(chalk.red(`✗ ${err.message}`));
        process.exit(1);
      }
      break;
    }

    case 'use': {
      writeConfig({ meshId: opts.meshId });
      console.log(chalk.green(`✓ Active mesh set to: ${opts.meshId}`));
      break;
    }

    case 'list': {
      console.log(chalk.dim('  Current mesh: ') + (readConfig().meshId || chalk.yellow('not set')));
      console.log(chalk.dim('  To list all meshes, visit: meshwire.io/dashboard'));
      break;
    }
  }
}
