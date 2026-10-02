// Exact-host, isolated installer smoke probe. No host session or provider call.
import assert from 'node:assert/strict';
import { ConfigProvider, Effect } from 'effect';
const runInstallation = (effect) => Effect.runPromise(effect.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ preserveEmptyStrings: true })))));
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  previewCodexInstallation, installCodexIntegration, inspectCodexInstallation,
  uninstallCodexIntegration,
} from '../../src/onboarding/codex-installation.ts';
import {
  previewClaudeInstallation, installClaudeIntegration, inspectClaudeInstallation,
  uninstallClaudeIntegration,
} from '../../src/onboarding/claude-installation.ts';

const project = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const codexExecutable = process.env.HAPSLAND_105_CODEX ?? '/tmp/hapsland-105-hosts/node_modules/.bin/codex';
const claudeExecutable = process.env.HAPSLAND_105_CLAUDE ?? '/tmp/hapsland-105-hosts/node_modules/.bin/claude';
const exact = (binary, version) => {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes(version));
};
exact(codexExecutable, '0.155.1');
exact(claudeExecutable, '2.1.218');
const scratch = await mkdtemp(join(tmpdir(), 'hapsland-105-installer-'));
const priorRuntime = process.env.REVIEW_INSTALL_RUNTIME;
const priorEntrypoint = process.env.REVIEW_INSTALL_ENTRYPOINT;
process.env.REVIEW_INSTALL_RUNTIME = process.execPath;
process.env.REVIEW_INSTALL_ENTRYPOINT = join(project, 'dist/cli.js');
const results = [];
try {
  const codexHome = join(scratch, 'codex');
  const claudeHome = join(scratch, 'claude');
  await mkdir(codexHome, { mode: 0o700 });
  await mkdir(claudeHome, { mode: 0o700 });
  const codexRequest = { codexHome, codexExecutable };
  const codexPreview = await runInstallation(previewCodexInstallation(codexRequest));
  assert.equal(codexPreview.status, 'preview');
  const codexInstall = await runInstallation(installCodexIntegration({ ...codexRequest, proposalDigest: codexPreview.proposal.digest }));
  assert.equal(codexInstall.status, 'installed');
  assert.equal((await runInstallation(inspectCodexInstallation(codexRequest))).status, 'installed');
  const codexRemoval = await runInstallation(uninstallCodexIntegration(codexRequest));
  assert.equal(codexRemoval.status, 'preview');
  const codexUninstall = await runInstallation(uninstallCodexIntegration({ ...codexRequest, proposalDigest: codexRemoval.proposal.digest }));
  assert.equal(codexUninstall.status, 'uninstalled');
  results.push({ host: 'codex-cli', version: '0.155.1', install: codexInstall.status,
    inspect: 'installed', uninstall: codexUninstall.status });

  const claudeRequest = { claudeHome, claudeExecutable };
  const claudePreview = (await runInstallation(previewClaudeInstallation(claudeRequest)));
  assert.equal(claudePreview.status, 'preview');
  const claudeInstall = await runInstallation(installClaudeIntegration({ ...claudeRequest, proposalDigest: claudePreview.proposal.digest }));
  assert.equal(claudeInstall.status, 'complete');
  assert.equal((await runInstallation(inspectClaudeInstallation(claudeRequest))).status, 'ready');
  const claudeRemoval = await runInstallation(uninstallClaudeIntegration(claudeRequest));
  assert.equal(claudeRemoval.status, 'preview');
  const claudeUninstall = await runInstallation(uninstallClaudeIntegration({ ...claudeRequest, proposalDigest: claudeRemoval.proposal.digest }));
  assert.equal(claudeUninstall.status, 'complete');
  results.push({ host: 'claude-code', version: '2.1.218', install: claudeInstall.status,
    inspect: 'ready', uninstall: claudeUninstall.status });
  const record = { issue: 105, platform: `${process.platform}-${process.arch}`,
    node: process.version, mode: 'exact-host isolated installer lifecycle; no model or Jev calls', results };
  const evidencePath = process.env.HAPSLAND_105_INSTALL_EVIDENCE_FILE;
  if (evidencePath) await writeFile(evidencePath, JSON.stringify(record, null, 2) + '\n');
  process.stdout.write(JSON.stringify(record) + '\n');
} finally {
  if (priorRuntime === undefined) delete process.env.REVIEW_INSTALL_RUNTIME;
  else process.env.REVIEW_INSTALL_RUNTIME = priorRuntime;
  if (priorEntrypoint === undefined) delete process.env.REVIEW_INSTALL_ENTRYPOINT;
  else process.env.REVIEW_INSTALL_ENTRYPOINT = priorEntrypoint;
  await rm(scratch, { recursive: true, force: true });
}
