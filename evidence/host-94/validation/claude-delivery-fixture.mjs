// Offline Claude 2.1.218 feedback delivery. Provider bodies and host output stay in memory.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { configuredRules } from '../../../src/policy/rules.ts';

const variant = process.argv[2] ?? 'block';
assert.ok(['block', 'clear', 'notice'].includes(variant), 'expected block|clear|notice');
const project = resolve(import.meta.dirname, '../../..');
const binary = '/home/node/.local/share/claude/versions/2.1.218';
const root = mkdtempSync(join(tmpdir(), 'hapsland-94-delivery-'));
const repo = join(root, 'repo');
const profile = join(root, 'claude-home');
const home = join(root, 'home');
const source = join(repo, 'order-count.ts');
const started = Date.now();
const summary = { schemaVersion: 1, fixture: 'claude-production-feedback', variant,
  hostVersion: '2.1.218', provider: 'scripted-loopback', backend: 'production-compiled-controlled',
  userBlockOptIn: true, hostCeilingMs: 90_000, outputCeilingBytes: 2_000_000,
  hostLineCeilingBytes: 2_048, credentialRetained: false, requestBodyRetained: false,
  hostOutputRetained: false, modelTextRetained: false, sourceRetained: false,
  requestCount: 0, postHookRequest: false, initialRequestHasRuleReference: false,
  initialRequestHasRepairRequest: false, postHookRequestHasRuleReference: false,
  postHookRequestHasRepairRequest: false, postHookUserMessageHasRuleReference: false,
  postHookUserMessageHasRepairRequest: false, postHookRequestHasNotice: false,
  postHookRequestHasRepairInNoticeControl: false, productionRuleReferenceCount: 0,
  productionRepairRequestInHostOutput: false, cliOutputForwardedUnchanged: false,
  completedFinding: false, completedClear: false, completedNoticeOnly: false,
  hookExitZero: false, hookOutputValid: false, completedReviewOutcome: false,
  hostTimedOut: false, outputCeilingExceeded: false, hostLineCeilingExceeded: false,
  hostExitCode: null, hostOutputBytes: 0, forwardedOutputBytes: 0, hookFinishedAtMs: null,
  postHookRequestAtMs: null, elapsedMs: null, outputBytes: 0 };
let server;
let child;
let hookFinishedAt = null;
let outputBytes = 0;
const ruleReference = '[r6_bare_domain_value, p=';
const repairRequest = 'Repair the listed finding(s) in the file, then continue.';
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
  mkdirSync(home);
  const userConfigPath = join(home, '.config', 'realtime-review-tool', 'config.jsonc');
  mkdirSync(join(home, '.config', 'realtime-review-tool'), { recursive: true });
  writeFileSync(userConfigPath, JSON.stringify({ version: 1, claudeFeedbackMode: 'block-current-findings' }));
  assert.equal(spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 2_000 }).stdout.trim(), '2.1.218 (Claude Code)');
  assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0);
  const outcomePath = join(root, 'outcomes.jsonl');
  const env = { ...safeEnv(), HOME: home, CLAUDE_CONFIG_DIR: profile,
    REVIEW_STATE_PATH: join(root, 'consent'), REVIEW_USER_CONFIG_PATH: userConfigPath,
    REVIEW_RESIDENT_DIR: join(root, 'resident'), REVIEW_CONTROL_JSON: JSON.stringify({
      ...(variant === 'notice' ? { failure: 'scripted offline backend failure' } : {}),
      outcomePath,
      answers: Object.fromEntries(configuredRules.map(rule => [rule.id, {
        _tag: 'Probability', probability: variant === 'block' && rule.id === 'r6_bare_domain_value' ? 0.9 : 0,
      }])),
    }), ANTHROPIC_API_KEY: 'offline-fixture-key', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
  const preview = runCli(['--enable'], { version: 1, operation: 'enable', cwd: repo }, env);
  assert.equal(preview.status, 'preview');
  assert.equal(runCli(['--enable-confirm'], { version: 1, operation: 'enable-confirm', cwd: repo,
    proposalDigest: preview.proposal.digest }, env).status, 'enabled');
  const hook = join(root, 'hook.mjs');
  const cliPath = JSON.stringify(join(project, 'dist/cli.js'));
  const hookSource = [
    "import {spawnSync} from 'node:child_process';",
    "import {appendFileSync} from 'node:fs';",
    'const chunks=[];for await(const c of process.stdin)chunks.push(c);',
    `const r=spawnSync(process.execPath,[${cliPath},'--claude-hook','--controlled','--controlled-writer'],` +
    '{input:Buffer.concat(chunks),env:process.env,timeout:4400,maxBuffer:262144});',
    'let valid=false,finding=false,clear=false,notice=false,ruleCount=0,repair=false;',
    "const rule='[r6_bare_domain_value, p=';",
    "const repairRequest='Repair the listed finding(s) in the file, then continue.';",
    "const cliBytes=Buffer.isBuffer(r.stdout)?r.stdout:Buffer.alloc(0);",
    "const line=cliBytes.toString('utf8').trim();const outputBytes=cliBytes.byteLength;",
    'try{const j=JSON.parse(line);',
    `if(process.env.HAPSLAND_DELIVERY_VARIANT==='block'){` +
      `finding=r.status===0&&Object.keys(j).length===2&&j.decision==='block'&&typeof j.reason==='string';` +
      `ruleCount=finding?(j.reason.match(/\\[r6_bare_domain_value, p=/g)||[]).length:0;` +
      `repair=finding&&j.reason.includes(repairRequest);` +
      `valid=finding&&ruleCount===1&&repair&&j.reason.includes('Hapsland found a current rule finding after this edit succeeded.');}` +
    `else if(process.env.HAPSLAND_DELIVERY_VARIANT==='clear'){clear=r.status===0&&line==='{}'&&Object.keys(j).length===0;valid=clear;}` +
    `else{const text=j.hookSpecificOutput?.additionalContext;` +
      `notice=r.status===0&&j.decision===undefined&&typeof text==='string'&&text.includes('Operational notice: Jev was unavailable')&&` +
      `!text.includes(rule)&&!text.includes('Repair the listed finding(s)');valid=notice;}` +
    `}catch{}`,
    "const forwardedBytes=Buffer.from(cliBytes);const forwardedUnchanged=cliBytes.equals(forwardedBytes);",
    "const status=(writeSucceeded)=>appendFileSync(process.env.HAPSLAND_DELIVERY_STATUS,JSON.stringify({exitZero:r.status===0,valid,finding,clear,notice,ruleCount,repair,outputBytes,forwardedBytes:forwardedBytes.byteLength,cliOutputForwardedUnchanged:r.status===0&&writeSucceeded&&forwardedUnchanged,at:Date.now()})+'\\n');",
    // Forward the compiled CLI's captured stdout buffer without re-encoding or constructing a host envelope.
    'if(r.status===0)process.stdout.write(forwardedBytes,error=>status(error==null));else status(false);',
  ].join('\n');
  writeFileSync(hook, hookSource);
  mkdirSync(join(repo, '.claude'));
  writeFileSync(join(repo, '.claude', 'settings.json'), JSON.stringify({ hooks: { PostToolUse: [{
    matcher: 'Write', hooks: [{ type: 'command', command: `${process.execPath} ${hook}`, timeout: 5 }],
  }] } }));
  server = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.includes('/v1/messages')) { res.writeHead(404).end(); return; }
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    summary.requestCount++;
    const serialized = JSON.stringify(body);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userText = messages.filter(message => message?.role === 'user')
      .map(message => JSON.stringify(message.content)).join('\n');
    if (summary.requestCount === 1) {
      summary.initialRequestHasRuleReference = serialized.includes(ruleReference);
      summary.initialRequestHasRepairRequest = serialized.includes(repairRequest);
    }
    const now = Date.now();
    if (hookFinishedAt !== null && now >= hookFinishedAt) {
      summary.postHookRequest = true;
      summary.postHookRequestAtMs ??= now - started;
      summary.postHookRequestHasRuleReference ||= serialized.includes(ruleReference);
      summary.postHookRequestHasRepairRequest ||= serialized.includes(repairRequest);
      summary.postHookUserMessageHasRuleReference ||= userText.includes(ruleReference);
      summary.postHookUserMessageHasRepairRequest ||= userText.includes(repairRequest);
      summary.postHookRequestHasNotice ||= serialized.includes('Operational notice: Jev was unavailable');
      summary.postHookRequestHasRepairInNoticeControl ||= variant === 'notice' && serialized.includes(repairRequest);
    }
    if (summary.requestCount === 1) send(res, [{ type: 'tool_use', id: 'toolu_fixture_1', name: 'Write',
      input: { file_path: source, content: 'type OrderCount = number\n' } }], 'tool_use');
    else send(res, [{ type: 'text', text: 'Done.' }], 'end_turn');
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
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
        summary.completedClear = status.clear;
        summary.completedNoticeOnly = status.notice;
        summary.productionRuleReferenceCount = status.ruleCount;
        summary.productionRepairRequestInHostOutput = status.repair;
        summary.hostOutputBytes = status.outputBytes;
        summary.hostLineCeilingExceeded = status.outputBytes > 2_048;
        summary.forwardedOutputBytes = status.forwardedBytes;
        summary.cliOutputForwardedUnchanged = status.cliOutputForwardedUnchanged;
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
    summary.completedFinding = status.finding; summary.completedClear = status.clear;
    summary.completedNoticeOnly = status.notice;
    summary.productionRuleReferenceCount = status.ruleCount;
    summary.productionRepairRequestInHostOutput = status.repair;
    summary.hostOutputBytes = status.outputBytes;
    summary.hostLineCeilingExceeded = status.outputBytes > 2_048;
    summary.forwardedOutputBytes = status.forwardedBytes;
    summary.cliOutputForwardedUnchanged = status.cliOutputForwardedUnchanged;
  }
  summary.outputBytes = outputBytes;
  if (existsSync(outcomePath)) {
    const expected = variant === 'block' ? 'completed-findings' : 'completed-clear';
    summary.completedReviewOutcome = variant !== 'notice' && readFileSync(outcomePath, 'utf8').trim().split('\n')
      .some(line => { try { return JSON.parse(line).outcome === expected; } catch { return false; } });
  }
  summary.syntheticFileCreated = existsSync(source) && readFileSync(source, 'utf8') === 'type OrderCount = number\n';
  summary.elapsedMs = Date.now() - started;
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  const expectedFinding = variant === 'block';
  const expectedClear = variant === 'clear';
  const expectedNotice = variant === 'notice';
  const isBlock = summary.completedFinding && summary.productionRuleReferenceCount === 1 &&
    summary.productionRepairRequestInHostOutput && summary.postHookRequestHasRuleReference &&
    summary.postHookRequestHasRepairRequest && summary.postHookUserMessageHasRuleReference &&
    summary.postHookUserMessageHasRepairRequest;
  const isClear = summary.completedClear && !summary.postHookRequestHasRuleReference &&
    !summary.postHookRequestHasRepairRequest;
  const isNotice = summary.completedNoticeOnly && summary.postHookRequestHasNotice &&
    !summary.postHookRequestHasRuleReference && !summary.postHookRequestHasRepairRequest &&
    !summary.postHookRequestHasRepairInNoticeControl;
  if (summary.hostExitCode !== 0 || summary.completedFinding !== expectedFinding ||
      summary.completedClear !== expectedClear || summary.completedNoticeOnly !== expectedNotice ||
      summary.completedReviewOutcome !== (variant !== 'notice') || !summary.hookExitZero ||
      !summary.hookOutputValid || !summary.cliOutputForwardedUnchanged || !summary.postHookRequest ||
      summary.initialRequestHasRuleReference || summary.initialRequestHasRepairRequest ||
      summary.hostLineCeilingExceeded || !summary.syntheticFileCreated ||
      (variant === 'block' && !isBlock) || (variant === 'clear' && !isClear) ||
      (variant === 'notice' && !isNotice) || summary.hostTimedOut || summary.outputCeilingExceeded) {
    process.exitCode = 1;
  }
} finally {
  if (server) await new Promise(resolveClose => server.close(resolveClose));
  rmSync(root, { recursive: true, force: true });
}
