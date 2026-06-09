// meshwire mesh -- create, list, switch meshes
import chalk from 'chalk';
import { requireConfig, writeConfig, readConfig } from '../config.js';
import { writeMeshJson } from '../mesh-schema.js';
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
      const { meshId } = opts;
      // Write to global config
      writeConfig({ meshId });

      // Also write .mesh.json in the current workspace directory
      // so this folder is associated with the mesh
      const config = readConfig();
      writeMeshJson({
        mesh_id: meshId,
        workspace_name: process.cwd().split(/[/\\]/).pop() || 'workspace',
        agent_name: config.agentName || 'agent',
        harness: config.harness || 'copilot',
      });

      console.log(chalk.green(`✓ Active mesh: ${meshId}`));
      console.log(chalk.dim(`  ~/.meshwire/config.json updated`));
      console.log(chalk.dim(`  .mesh.json written to current directory`));
      break;
    }

    case 'list': {
      const cfg = readConfig();
      if (!cfg.token) {
        console.error(chalk.red('✗ Not authenticated.'));
        console.error(chalk.dim('  Run `meshwire login` to sign in and get your API token.'));
        process.exit(1);
      }
      try {
        const { meshes } = await client.listMeshes();
        if (!meshes || meshes.length === 0) {
          console.log(chalk.dim('  No meshes yet.'));
          console.log(chalk.dim('  Run `meshwire mesh create --name my-mesh` to create one.'));
          break;
        }
        const activeMeshId = cfg.meshId;
        console.log('');
        for (const m of meshes) {
          const active = m.mesh_id === activeMeshId;
          const marker = active ? chalk.green('* ') : '  ';
          const id    = chalk.cyan(m.mesh_id);
          const name  = chalk.white(m.name || 'Untitled');
          const agents = chalk.dim(`${m.agent_count ?? 0} agent${(m.agent_count ?? 0) === 1 ? '' : 's'}`);
          const date  = chalk.dim(m.created_at ? new Date(m.created_at).toLocaleDateString() : '');
          console.log(`${marker}${id}  ${name}  ${agents}  ${date}`);
        }
        console.log('');
        if (!activeMeshId) {
          console.log(chalk.dim('  No active mesh. Run `meshwire mesh use <id>` to activate one.'));
        } else {
          console.log(chalk.dim(`  Active: ${activeMeshId}  (change with \`meshwire mesh use <id>\`)`));
        }
      } catch (err) {
        if (err.message.startsWith('401')) {
          console.error(chalk.red('✗ Authentication failed.'));
          console.error(chalk.dim('  Your token may be expired. Run `meshwire login` to re-authenticate.'));
        } else {
          console.error(chalk.red(`✗ ${err.message}`));
        }
        process.exit(1);
      }
      break;
    }
  }
}
