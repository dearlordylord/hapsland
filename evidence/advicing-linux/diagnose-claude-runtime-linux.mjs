// Bounded, source-free diagnostic: no Hapsland hooks or fixture source.
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const binary = process.env.HAPSLAND_105_CLAUDE ?? '/tmp/hapsland-105-hosts/node_modules/.bin/claude';
const version = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 15000 });
if (version.status !== 0 || !version.stdout.includes('2.1.218')) throw new Error('Pinned Claude unavailable');
const scratch = await mkdtemp(join(tmpdir(), 'hapsland-claude-diagnosis-'));
try {
  const env = { ...process.env };
  for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'TYPESAFE_API_KEY']) delete env[key];
  const started = Date.now();
  const result = spawnSync(binary, ['-p', '--output-format', 'json', '--no-session-persistence',
    '--setting-sources', '', 'Reply OK.'], { cwd: scratch, env, encoding: 'utf8', timeout: 15000 });
  await writeFile(join(scratch, 'stdout'), result.stdout ?? '', { mode: 0o600 });
  await writeFile(join(scratch, 'stderr'), result.stderr ?? '', { mode: 0o600 });
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch {}
  const message = typeof parsed?.result === 'string' ? parsed.result : '';
  const report = { schema: 'hapsland-105-claude-runtime-diagnostic-v1', recordedAt: new Date().toISOString(),
    hostVersion: '2.1.218', platform: process.platform, promptClass: 'minimal acknowledgment',
    userProjectLocalSettingsExcluded: true, customHapslandHooksInstalled: false,
    attempts: 1, timeoutMs: 15000, elapsedMs: Date.now() - started,
    exitCode: result.status, signal: result.signal, structuredResultType: parsed?.type ?? null,
    structuredResultSubtype: parsed?.subtype ?? null, isError: parsed?.is_error === true,
    exactUsageLimitPattern: /you.ve hit your limit/i.test(message),
    keywordCategories: ['limit', 'reset', 'quota', 'authentication', 'network'].filter(word => message.toLowerCase().includes(word)),
    resetClock: message.match(/resets?\s+(\d{1,2}(?::\d\d)?\s*[ap]m)/i)?.[1] ?? null,
    resultLength: message.length, stderrBytes: Buffer.byteLength(result.stderr ?? ''),
    sourceOrRawResponseRetained: false,
    limitation: 'Limit/reset metadata does not establish root cause, quota class, timezone, or recovery time' };
  const output = process.env.HAPSLAND_105_EVIDENCE_FILE ?? 'evidence/advicing-linux/linux-claude-runtime-diagnostic.json';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
