// meshwire login — browser-based OAuth, saves credentials to ~/.meshwire/credentials.json
//
// Flow:
// 1. Find a free local port
// 2. Start a tiny HTTP server to receive the OAuth callback
// 3. Open browser to meshwire.io/auth/cli?port=PORT
// 4. User signs in with GitHub (standard OAuth flow)
// 5. Server redirects to http://localhost:PORT?token=mw_xxx&login=username
// 6. CLI captures the token, saves to ~/.meshwire/credentials.json
// 7. Optionally register as an agent in the last-used mesh

import { createServer } from 'http';
import { URL } from 'url';
import chalk from 'chalk';
import { writeCredentials, readCredentials } from '../auth.js';
import { readConfig, writeConfig } from '../config.js';
import { MeshWireClient } from '../api.js';

const DEFAULT_URL = 'https://meshwire.io';
const CLI_PORT_RANGE = [57700, 57799]; // range of ports to try

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function waitForCallback(port, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Login timed out after 2 minutes. Try again.'));
    }, timeoutMs);

    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      const token = url.searchParams.get('token');
      const login = url.searchParams.get('login');
      const error = url.searchParams.get('error');

      // Send a nice success/error page back to the browser
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (token) {
        res.end(`<!DOCTYPE html><html><head><title>MeshWire</title>
          <style>body{font-family:system-ui;background:#080808;color:#f5f5f5;display:grid;place-items:center;height:100vh;margin:0}
          .box{text-align:center;padding:40px;border:1px solid rgba(124,58,237,.4);border-radius:20px;background:rgba(124,58,237,.08)}
          h2{color:#a78bfa;margin-bottom:12px}p{color:rgba(255,255,255,.6)}</style></head>
          <body><div class="box"><h2>✅ Signed in as ${login || 'you'}!</h2>
          <p>You can close this tab and return to your terminal.</p></div></body></html>`);
      } else {
        res.end(`<!DOCTYPE html><html><head><title>MeshWire</title>
          <style>body{font-family:system-ui;background:#080808;color:#f5f5f5;display:grid;place-items:center;height:100vh;margin:0}
          .box{text-align:center;padding:40px;border:1px solid rgba(251,113,133,.4);border-radius:20px}
          h2{color:#fb7185;margin-bottom:12px}p{color:rgba(255,255,255,.6)}</style></head>
          <body><div class="box"><h2>❌ Login failed</h2>
          <p>${error || 'Unknown error'}. Please close this tab and try again.</p></div></body></html>`);
      }

      clearTimeout(timer);
      server.close();

      if (token) {
        resolve({ token, login });
      } else {
        reject(new Error(`Login failed: ${error || 'unknown error'}`));
      }
    });

    server.listen(port, '127.0.0.1', () => {
      // Server is ready
    });

    server.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function openBrowser(url) {
  const { platform } = process;
  const { execSync } = await import('child_process');
  try {
    if (platform === 'darwin') execSync(`open "${url}"`, { stdio: 'ignore' });
    else if (platform === 'win32') execSync(`start "" "${url}"`, { shell: true, stdio: 'ignore' });
    else execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function cmdLogin(opts) {
  const meshwireUrl = opts.url || readConfig().url || DEFAULT_URL;

  console.log('\n' + chalk.bold('🕸  MeshWire Login') + '\n');

  // Check if already logged in
  const existing = readCredentials();
  if (existing?.token && !opts.force) {
    console.log(chalk.dim('  Already signed in as ') + chalk.bold(existing.login || 'unknown'));
    console.log(chalk.dim('  Use --force to re-authenticate.\n'));

    const { createInterface } = await import('readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(chalk.dim('  Re-authenticate? (y/N) '));
    rl.close();
    if (!answer.toLowerCase().startsWith('y')) {
      console.log(chalk.dim('\n  Keeping existing credentials.\n'));
      return;
    }
  }

  // Find a free port
  const port = await findFreePort();
  const authUrl = `${meshwireUrl}/auth/cli?port=${port}`;

  console.log(chalk.dim('  Opening browser for GitHub OAuth...\n'));
  console.log(chalk.cyan(`  ${authUrl}\n`));
  console.log(chalk.dim('  If the browser did not open, paste the URL above.\n'));

  const opened = await openBrowser(authUrl);
  if (!opened) {
    console.log(chalk.yellow('  Could not open browser automatically.'));
    console.log(chalk.dim('  Please open the URL above in your browser.\n'));
  }

  // Wait for callback
  let result;
  try {
    result = await waitForCallback(port);
  } catch (err) {
    console.error('\n' + chalk.red(`  ✗ ${err.message}\n`));
    process.exit(1);
  }

  const { token, login } = result;

  // Save to credentials.json
  writeCredentials({ token, login, savedAt: new Date().toISOString() });

  // Also update legacy config.json for backward compat
  writeConfig({ token });

  console.log(chalk.bold.green(`\n  ✅ Signed in as ${login}!\n`));
  console.log(chalk.dim('  Credentials saved to ~/.meshwire/credentials.json\n'));

  // Optionally create a mesh if none exists
  const config = readConfig();
  if (!config.meshId && !opts.skipMesh) {
    console.log(chalk.dim('  No mesh configured yet.'));
    console.log(chalk.dim(`  Run ${chalk.cyan('meshwire mesh create')} to create one, or`));
    console.log(chalk.dim(`  run ${chalk.cyan('meshwire init')} for full interactive setup.\n`));
  } else if (config.meshId) {
    // Update credentials with default mesh
    writeCredentials({ token, login, defaultMeshId: config.meshId, savedAt: new Date().toISOString() });
    console.log(chalk.dim(`  Default mesh: ${config.meshId}`));
    console.log('');
  }

  // Verify connection
  try {
    const client = new MeshWireClient({ url: meshwireUrl, token });
    await client.health();
    console.log(chalk.green('  ✓ Connected to MeshWire\n'));
  } catch {
    console.log(chalk.yellow('  ⚠ Could not verify connection — check your URL\n'));
  }

  console.log(chalk.dim('  Next steps:'));
  console.log(chalk.cyan('    meshwire init') + chalk.dim('                 — full workspace setup'));
  console.log(chalk.cyan('    meshwire init --harness copilot') + chalk.dim(' — set up Copilot CLI extension'));
  console.log(chalk.cyan('    meshwire status') + chalk.dim('               — verify everything is wired\n'));
}
