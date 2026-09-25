// Offline Claude 2.1.218 delivery envelope. All provider bodies stay in memory.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { configuredRules } from '../../../src/policy/rules.ts';

const variant = process.argv[2] ?? 'context';
assert.ok(['context', 'plain', 'block'].includes(variant), 'expected context|plain|block');
const project = resolve(import.meta.dirname, '../../..');
const binary = '/home/node/.local/share/claude/versions/2.1.218';
const root = mkdtempSync(join(tmpdir(), 'hapsland-94-delivery-'));
const repo = join(root, 'repo');
const profile = join(root, 'claude-home');
const source = join(repo, 'order-count.ts');
const marker = `HAPSLAND_DELIVERY_${randomUUID().replaceAll('-', '')}`;
const started = Date.now();
const summary = { schemaVersion: 1, fixture: 'claude-delivery-envelope', variant,
  hostVersion: '2.1.218', provider: 'scripted-loopback', backend: 'production-compiled-controlled',
  hostCeilingMs: 90_000, outputCeilingBytes: 2_000_000, credentialRetained: false,
  requestBodyRetained: false, modelTextRetained: false, sourceRetained: false,
  requestCount: 0, postHookRequest: false, markerInPostHookRequest: false,
  markerInToolResult: false, markerInMessageHistory: false,
  markerInUserMessage: false, markerInInitialRequest: false,
  productionFindingRuleInUserMessage: false, productionFindingRuleInInitialRequest: false,
  actingRuleReferenceInUserMessage: false,
  completedFinding: false, hookExitZero: false, hookOutputValid: false,
  completedReviewOutcome: false,
  hostTimedOut: false, outputCeilingExceeded: false, hostExitCode: null,
  hookFinishedAtMs: null, postHookRequestAtMs: null, elapsedMs: null };
let server;
let child;
let hookFinishedAt = null;
let outputBytes = 0;
const safeEnv = () => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/KEY|TOKEN|SECRET|AUTH|PROXY|BASE_URL|BEDROCK|VERTEX|FOUNDRY/i.test(key)) delete env[key];
  return env;
};
const runCli = (args, input, env) => {
  const result = spawnSync(process.execPath, [join(project, 'dist/cli.js'), ...args], {
    cwd: repo, env, input: JSON.stringify(input), encoding: 'utf8', timeout: 10_000, maxBuffer: 262_144,
  });
  assert.equal(result.status, 0, 'compiled CLI setup failed');
  return JSON.parse(result.stdout);
};
const send = (res, blocks, stopReason) => {
  const message = { id: `msg_${randomUUID().replaceAll('-', '')}`, type: 'message', role: 'assistant',
    model: 'claude-sonnet-4-20250514', content: [], stop_reason: null, stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 0 } };
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  event('message_start', { message });
  blocks.forEach((block, index) => {
    if (block.type === 'tool_use') {
      event('content_block_start', { index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } });
      event('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
    } else {
      event('content_block_start', { index, content_block: { type: 'text', text: '' } });
      event('content_block_delta', { index, delta: { type: 'text_delta', text: block.text } });
    }
    event('content_block_stop', { index });
  });
  event('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 20 } });
  event('message_stop', {});
  res.end();
};

try {
  mkdirSync(repo);
  mkdirSync(profile);
  mkdirSync(join(root, 'home'));
  assert.equal(spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 2_000 }).stdout.trim(), '2.1.218 (Claude Code)');
  assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0);
  const env = { ...safeEnv(), HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: profile,
    REVIEW_STATE_PATH: join(root, 'consent'),
    REVIEW_RESIDENT_DIR: join(root, 'resident'), REVIEW_CONTROL_JSON: JSON.stringify({
      outcomePath: join(root, 'outcomes.jsonl'),
      answers: Object.fromEntries(configuredRules.map(rule => [rule.id, {
        _tag: 'Probability', probability: rule.id === 'r6_bare_domain_value' ? 0.9 : 0,
      }])),
    }), ANTHROPIC_API_KEY: 'offline-fixture-key', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
  const preview = runCli(['--enable'], { version: 1, operation: 'enable', cwd: repo }, env);
  assert.equal(preview.status, 'preview');
  assert.equal(runCli(['--enable-confirm'], { version: 1, operation: 'enable-confirm', cwd: repo,
    proposalDigest: preview.proposal.digest }, env).status, 'enabled');
  const hook = join(root, 'hook.mjs');
  writeFileSync(hook, `import {spawnSync} from 'node:child_process';\n` +
    `import {appendFileSync} from 'node:fs';\n` +
    `const chunks=[];for await(const c of process.stdin)chunks.push(c);\n` +
    `const r=spawnSync(process.execPath,[${JSON.stringify(join(project, 'dist/cli.js'))},'--claude-hook','--controlled','--controlled-writer'],` +
    `{input:Buffer.concat(chunks),encoding:'utf8',env:process.env,timeout:4400,maxBuffer:262144});\n` +
    `let valid=false, finding=false, output='';\n` +
    `if(r.status===0){try{const j=JSON.parse(r.stdout);` +
    `finding=typeof j.hookSpecificOutput?.additionalContext==='string'&&j.hookSpecificOutput.additionalContext.includes('[r6_bare_domain_value, p=');` +
    `if(finding){valid=true;const marker=process.env.HAPSLAND_DELIVERY_MARKER;` +
    `output=process.env.HAPSLAND_DELIVERY_VARIANT==='plain'?marker:` +
    `JSON.stringify(process.env.HAPSLAND_DELIVERY_VARIANT==='block'?` +
    `{decision:'block',reason:'Act on rule r6_bare_domain_value. '+marker}:` +
    `{hookSpecificOutput:{...j.hookSpecificOutput,additionalContext:j.hookSpecificOutput.additionalContext+'\\n'+marker}});}` +
    `}catch{}}\n` +
    `appendFileSync(process.env.HAPSLAND_DELIVERY_STATUS,JSON.stringify({exitZero:r.status===0,valid,finding,at:Date.now()})+'\\n');\n` +
    `if(output)process.stdout.write(output);\n`);
  mkdirSync(join(repo, '.claude'));
  writeFileSync(join(repo, '.claude', 'settings.json'), JSON.stringify({ hooks: { PostToolUse: [{
    matcher: 'Write', hooks: [{ type: 'command', command: `${process.execPath} ${hook}`, timeout: 5 }],
  }] } }));
  server = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.includes('/v1/messages')) { res.writeHead(404).end(); return; }
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    summary.requestCount++;
    const userToolResults = Array.isArray(body.messages) ? body.messages.flatMap(message =>
      message?.role === 'user' && Array.isArray(message.content)
        ? message.content.filter(block => block?.type === 'tool_result') : []) : [];
    const markerInToolResult = userToolResults.some(block => JSON.stringify(block.content).includes(marker));
    if (summary.requestCount === 1) {
      summary.markerInInitialRequest = JSON.stringify(body).includes(marker);
      summary.productionFindingRuleInInitialRequest = JSON.stringify(body).includes('[r6_bare_domain_value, p=');
    }
    const now = Date.now();
    if (hookFinishedAt !== null && now >= hookFinishedAt) {
      summary.postHookRequest = true;
      summary.postHookRequestAtMs ??= now - started;
      summary.markerInPostHookRequest ||= JSON.stringify(body).includes(marker);
      summary.markerInToolResult ||= markerInToolResult;
      summary.markerInMessageHistory ||= JSON.stringify(body.messages).includes(marker);
      summary.markerInUserMessage ||= Array.isArray(body.messages) && body.messages.some(
        message => message?.role === 'user' && JSON.stringify(message.content).includes(marker));
      summary.productionFindingRuleInUserMessage ||= Array.isArray(body.messages) && body.messages.some(
        message => message?.role === 'user' && JSON.stringify(message.content).includes('[r6_bare_domain_value, p='));
      summary.actingRuleReferenceInUserMessage ||= Array.isArray(body.messages) && body.messages.some(
        message => message?.role === 'user' && JSON.stringify(message.content).includes('Act on rule r6_bare_domain_value.'));
    }
    if (summary.requestCount === 1) send(res, [{ type: 'tool_use', id: 'toolu_fixture_1', name: 'Write',
      input: { file_path: source, content: 'type OrderCount = number\n' } }], 'tool_use');
    else send(res, [{ type: 'text', text: 'Done.' }], 'end_turn');
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  env.HAPSLAND_DELIVERY_MARKER = marker;
  env.HAPSLAND_DELIVERY_VARIANT = variant;
  env.HAPSLAND_DELIVERY_STATUS = join(root, 'hook-status.jsonl');
  const prompt = 'Use native Write to create order-count.ts with one OrderCount number type, then finish.';
  child = spawn(binary, ['-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--allowedTools', 'Read,Edit,Write', '--permission-mode', 'acceptEdits', prompt], {
    cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const watch = setInterval(() => {
    if (hookFinishedAt === null && existsSync(env.HAPSLAND_DELIVERY_STATUS)) {
      try { const status = JSON.parse(readFileSync(env.HAPSLAND_DELIVERY_STATUS, 'utf8').trim().split('\n').at(-1));
        hookFinishedAt = status.at;
        summary.hookFinishedAtMs = hookFinishedAt - started;
        summary.hookExitZero = status.exitZero;
        summary.hookOutputValid = status.valid;
        summary.completedFinding = status.finding;
      } catch { /* partial write */ }
    }
  }, 5);
  const timer = setTimeout(() => {
    summary.hostTimedOut = true;
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 1_000).unref();
  }, 88_000);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    outputBytes += chunk.length;
    if (outputBytes > 2_000_000) {
      summary.outputCeilingExceeded = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1_000).unref();
    }
  });
  const close = await new Promise(resolveClose => child.on('close', (code, signal) => resolveClose({ code, signal })));
  clearTimeout(timer); clearInterval(watch);
  summary.hostExitCode = close.code;
  if (hookFinishedAt === null && existsSync(env.HAPSLAND_DELIVERY_STATUS)) {
    const status = JSON.parse(readFileSync(env.HAPSLAND_DELIVERY_STATUS, 'utf8').trim().split('\n').at(-1));
    hookFinishedAt = status.at; summary.hookFinishedAtMs = status.at - started;
    summary.hookExitZero = status.exitZero; summary.hookOutputValid = status.valid;
    summary.completedFinding = status.finding;
  }
  summary.outputBytes = outputBytes;
  if (existsSync(join(root, 'outcomes.jsonl'))) {
    summary.completedReviewOutcome = readFileSync(join(root, 'outcomes.jsonl'), 'utf8').trim().split('\n')
      .some(line => { try { return JSON.parse(line).outcome === 'completed-findings'; } catch { return false; } });
  }
  summary.syntheticFileCreated = existsSync(source) && readFileSync(source, 'utf8') === 'type OrderCount = number\n';
  summary.elapsedMs = Date.now() - started;
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  const expectedMarker = variant !== 'plain';
  if (summary.hostExitCode !== 0 || !summary.completedFinding || !summary.completedReviewOutcome ||
      !summary.postHookRequest ||
      summary.markerInPostHookRequest !== expectedMarker ||
      summary.markerInUserMessage !== expectedMarker || summary.markerInInitialRequest ||
      summary.productionFindingRuleInInitialRequest ||
      summary.productionFindingRuleInUserMessage !== (variant === 'context') ||
      summary.actingRuleReferenceInUserMessage !== (variant === 'block') ||
      !summary.syntheticFileCreated) process.exitCode = 1;
} finally {
  if (server) await new Promise(resolveClose => server.close(resolveClose));
  rmSync(root, { recursive: true, force: true });
}
