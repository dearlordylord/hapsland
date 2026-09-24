// Offline, disposable #94 installer acceptance. No host model session or Jev call.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const project = resolve(import.meta.dirname, '../../..');
const cli = join(project, 'src/cli.ts');
const host = process.argv[2];
assert.ok(host === 'claude' || host === 'opencode', 'usage: node installation.mjs claude|opencode');
const root = mkdtempSync(join(tmpdir(), `hapsland-94-${host}-`));
const home = join(root, 'host');
const repo = join(root, 'repo');
mkdirSync(home, { recursive: true });
mkdirSync(repo);
const runGit = spawnSync('git', ['init', '-q', repo]);
assert.equal(runGit.status, 0, 'git init');
const field = host === 'claude' ? 'claudeHome' : 'opencodeConfigHome';
const executable = host === 'claude' ? 'claudeExecutable' : 'opencodeExecutable';
const request = { version: 1, host, [field]: home, [executable]: host };
const env = { ...process.env, REVIEW_INSTALL_RUNTIME: process.execPath, REVIEW_INSTALL_ENTRYPOINT: cli };
const call = (operation, proposalDigest) => {
  const result = spawnSync(process.execPath, [cli, `--${operation}`], {
    cwd: project, env, input: JSON.stringify({ ...request, operation, ...(operation === 'doctor' ? { cwd: repo } : {}),
      ...(proposalDigest ? { proposalDigest } : {}) }), encoding: 'utf8', timeout: 10_000, maxBuffer: 262_144,
  });
  assert.equal(result.status, 0, `${operation} failed (output withheld)`);
  return JSON.parse(result.stdout);
};
const evidence = { schemaVersion: 1, host, exactVersion: null, checks: {}, rawHostOutputRetained: false,
  sourceOrCredentialRetained: false };
try {
  const version = spawnSync(host, ['--version'], { encoding: 'utf8', timeout: 2_000 });
  const observed = version.stdout.trim();
  assert.equal(version.status, 0);
  assert.ok(host === 'claude' ? observed.startsWith('2.1.218') : observed === '1.14.44');
  evidence.exactVersion = host === 'claude' ? '2.1.218' : observed;

  if (host === 'claude') {
    writeFileSync(join(home, 'settings.json'), JSON.stringify({ hooks: { PostToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'other-tool --check' }] },
    ] }, theme: 'dark' }, null, 2));
  } else {
    mkdirSync(join(home, 'plugins'));
    writeFileSync(join(home, 'plugins', 'other-tool.mjs'), 'export const OtherTool = async () => ({})\n');
  }
  const otherPath = host === 'claude' ? join(home, 'settings.json') : join(home, 'plugins', 'other-tool.mjs');
  const otherBefore = readFileSync(otherPath, 'utf8');
  const installPreview = call('install-preview');
  assert.equal(installPreview.status, 'preview');
  assert.equal(installPreview.sourceEgressAuthorized, false);
  assert.equal(call('install', installPreview.proposal.digest).status, 'complete');
  evidence.checks.install = true;
  const doctor = call('doctor');
  evidence.checks.doctorOwnership = doctor.checks.some(x => x.stage === 'configuration-ownership' && x.status === 'ready');
  assert.equal(evidence.checks.doctorOwnership, true);
  const updatePreview = call('update-preview');
  assert.equal(updatePreview.status, 'preview');
  assert.ok(['complete', 'already-current'].includes(call('update', updatePreview.proposal.digest).status));
  evidence.checks.update = true;
  if (host === 'claude') {
    const settings = JSON.parse(readFileSync(otherPath, 'utf8'));
    evidence.checks.coexistence = settings.theme === 'dark' &&
      settings.hooks.PostToolUse[0].matcher === 'Bash' &&
      settings.hooks.PostToolUse[0].hooks[0].command === 'other-tool --check';
  } else evidence.checks.coexistence = readFileSync(otherPath, 'utf8') === otherBefore;
  assert.equal(evidence.checks.coexistence, true);
  const uninstallPreview = call('uninstall');
  assert.equal(uninstallPreview.status, 'preview');
  assert.equal(call('uninstall', uninstallPreview.proposal.digest).status, 'complete');
  evidence.checks.uninstall = true;
  if (host === 'claude') {
    const settings = JSON.parse(readFileSync(otherPath, 'utf8'));
    evidence.checks.unrelatedPreserved = settings.theme === 'dark' &&
      settings.hooks.PostToolUse.length === 1 && settings.hooks.PostToolUse[0].matcher === 'Bash';
  } else evidence.checks.unrelatedPreserved = readFileSync(otherPath, 'utf8') === otherBefore &&
    !existsSync(join(home, 'plugins', 'hapsland.mjs'));
  assert.equal(evidence.checks.unrelatedPreserved, true);
  evidence.status = 'passed';
} catch (cause) {
  evidence.status = 'failed';
  evidence.failure = cause instanceof Error ? cause.message.replaceAll(root, '<fixture>') : 'unknown';
  process.exitCode = 1;
} finally {
  rmSync(root, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
