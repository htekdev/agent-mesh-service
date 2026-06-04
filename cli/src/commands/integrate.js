// meshwire integrate — print the full integration guide for your mesh
import chalk from 'chalk';
import { requireConfig } from '../config.js';
import { MeshWireClient } from '../api.js';

export async function cmdIntegrate(opts) {
  const config = requireConfig(['token', 'meshId']);
  const meshId = opts.mesh || config.meshId;
  const client = new MeshWireClient();

  try {
    const guide = await client.getIntegrationGuide(meshId, opts.format || 'all');

    if (opts.json) {
      console.log(JSON.stringify(guide, null, 2));
      return;
    }

    const { integration } = guide;
    console.log('\n' + chalk.bold('🕸  MeshWire Integration Guide') + '\n');
    console.log(chalk.dim(`  Mesh:     `) + integration.mesh_id);
    console.log(chalk.dim(`  Name:     `) + (integration.mesh_name || '—'));
    console.log(chalk.dim(`  Base URL: `) + integration.base_url);
    console.log('');

    if (integration.skill_document) {
      console.log(chalk.bold('── Skill Document ──────────────────────────'));
      console.log(integration.skill_document);
    }

    if (integration.tools?.length) {
      console.log(chalk.bold('── Tool Definitions ────────────────────────'));
      for (const tool of integration.tools) {
        console.log(chalk.cyan(`  ${tool.name}`) + chalk.dim(` — ${tool.description}`));
      }
      console.log('');
      console.log(chalk.dim('  Run with --json to get the full OpenAPI-style tool definitions.'));
    }
  } catch (err) {
    console.error(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }
}
