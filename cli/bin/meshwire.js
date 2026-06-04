#!/usr/bin/env node
// meshwire CLI entry point
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

// Dynamic import to allow top-level await in commands
const { run } = await import('../src/cli.js');
await run(pkg.version);
