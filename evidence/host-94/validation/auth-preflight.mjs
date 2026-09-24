// Read-only, source-free host readiness summary. Never prints credential material.
import { spawnSync } from 'node:child_process';

const run = (command, args) => spawnSync(command, args, {
  encoding: 'utf8', timeout: 5_000, maxBuffer: 64_000,
});
const claudeVersion = run('claude', ['--version']);
const openCodeVersion = run('opencode', ['--version']);
const claudeAuth = run('claude', ['auth', 'status', '--json']);
const openCodeAuth = run('opencode', ['auth', 'list']);
let claudeLoggedIn = null;
try { claudeLoggedIn = JSON.parse(claudeAuth.stdout).loggedIn === true; } catch { /* unknown */ }
const count = openCodeAuth.stdout.match(/\b(\d+) credentials\b/);
const openCodeCredentials = count ? Number(count[1]) : null;
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  claude: { versionMatches: claudeVersion.status === 0 && claudeVersion.stdout.trim().startsWith('2.1.218'),
    loggedIn: claudeLoggedIn },
  opencode: { versionMatches: openCodeVersion.status === 0 && openCodeVersion.stdout.trim() === '1.14.44',
    credentialCount: openCodeCredentials },
  rawAuthOutputRetained: false,
  credentialsRetained: false,
}, null, 2)}\n`);
