// Genuine Hapsland capture/evaluation or released Abide post-edit handler.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import * as Effect from 'effect/Effect';
import { adaptCodexDirectEvent } from '../src/direct-event/adapter.ts';
import { prepareObservation, evaluatePrepared } from '../src/direct-event/pipeline.ts';
import { configuredRules } from '../src/policy/rules.ts';
import { TYPE_INPUT_CONTRACT } from '../src/rules/targets.ts';
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from '../src/runtime/review-config.ts';
import { Live } from '../src/jev-decision.ts';
const spec = JSON.parse(readFileSync(0, 'utf8'));
const graphSourcePaths = unit => {
  const paths = new Set(unit.sourceDependencies ?? []), pending = [unit.root];
  while (pending.length) {
    const node = pending.pop();
    if (node.artifact.path) paths.add(node.artifact.path);
    for (const edge of node.references) if (edge.kind === 'expanded') pending.push(edge.node);
  }
  return [...paths].sort();
};
const graphOmissions = unit => {
  const omissions = [], pending = [unit.root];
  while (pending.length) {
    const node = pending.pop();
    for (const edge of node.references) {
      if (edge.kind === 'expanded') pending.push(edge.node);
      if (edge.kind === 'omitted') omissions.push({ declaration: node.artifact.name, path: node.artifact.path, reason: edge.reason, target: edge.target });
    }
  }
  return omissions;
};
const { fixture, repo, candidate } = spec;
const beforeLines = fixture.before.trimEnd().split('\n'), afterLines = fixture.after.trimEnd().split('\n');
let prefix = 0;
while (prefix < Math.min(beforeLines.length, afterLines.length) && beforeLines[prefix] === afterLines[prefix]) prefix++;
const command = ['*** Begin Patch', '*** Update File: subject.ts', '@@',
  ...beforeLines.slice(0, prefix).map(x => ` ${x}`),
  ...beforeLines.slice(prefix).map(x => `-${x}`),
  ...afterLines.slice(prefix).map(x => `+${x}`), '*** End Patch'].join('\n');
const event = { hook_event_name: 'PostToolUse', tool_name: 'apply_patch', session_id: 'quality',
  turn_id: 'quality-turn', tool_use_id: 'quality-edit', cwd: repo,
  tool_input: { command }, tool_response: { success: true } };
if (candidate === 'abide') {
  const hook = join(spec.abideRoot, 'dist/abide-hook.js');
  const start = spawnSync(process.execPath, [hook, 'turn-start'], {
    input: JSON.stringify({ ...event, hook_event_name: 'UserPromptSubmit', prompt: fixture.prompt }), encoding: 'utf8', env: process.env, timeout: 12000 });
  writeFileSync(join(repo, fixture.filename), fixture.after);
  const result = spawnSync(process.execPath, [hook, 'post-tool-use'], {
    input: JSON.stringify(event), encoding: 'utf8', env: process.env, timeout: 25000 });
  let output; try { output = JSON.parse(result.stdout); } catch {}
  console.log(JSON.stringify({ status: result.status === 0 ? 'handler-completed' : 'handler-failed',
    startExit: start.status, hookExit: result.status,
    finding: String(output?.reason ?? output?.hookSpecificOutput?.additionalContext ?? '').replaceAll('-', '_').includes(fixture.ruleId) }));
} else {
  writeFileSync(join(repo, fixture.filename), fixture.after);
  const observation = await Effect.runPromise(adaptCodexDirectEvent(event));
  if (!observation) { console.log(JSON.stringify({ status: 'adaptation-failed' })); process.exit(0); }
  const prepared = await Effect.runPromise(prepareObservation(observation, { controlledWriter: true,
    advicee: observation.advicee, settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
    rules: configuredRules.filter(x => x.id === fixture.ruleId), inputContract: fixture.inputContract ?? TYPE_INPUT_CONTRACT,
    policy: { includes: ['**/*'], excludes: fixture.excludedPaths } }));
  const ready = prepared.outcomes.filter(x => x.status === 'ready');
  const summary = { status: prepared.observation.status, ready: ready.length,
    pathReasons: prepared.observation.outcomes.map(x => ({status: x.status, reason: x.reason ?? null,
      analysisStatus: x.analysis?.status ?? null,
      analysisReason: x.analysis?.reason ?? null,
      analysisFailures: x.analysis?.failures?.map(failure => ({ reason: failure.reason, root: typeof failure.root === 'string' ? failure.root : failure.root?.name ?? null })) ?? [],
    })),
    unitSummaries: prepared.observation.outcomes.flatMap(outcome => outcome.units ?? []).map(unit => ({
      root: unit.root.artifact.name,
      sourcePaths: graphSourcePaths(unit),
      omissions: graphOmissions(unit),
    })) ?? [],
    preparedUnits: ready.map(item => ({
      declaration: item.prepared.input.declaration.name,
      contract: item.prepared.input.contract,
      completeness: item.prepared.input.completeness,
      inputSha256: createHash('sha256').update(JSON.stringify(item.prepared.input)).digest('hex'),
      sourcePaths: [...new Set((item.prepared.input.sourceFingerprints ?? []).map(source => source.path))],
      ruleIds: item.prepared.input.rules.map(rule => rule.id),
    })),
    evaluations: [] };
  if (process.env.QUALITY_PREPARE_ONLY === '1') {
    console.log(JSON.stringify(summary));
    process.exit(0);
  }
  for (const item of ready) {
    const result = await Effect.runPromise(evaluatePrepared(item.prepared).pipe(Effect.provide(Live)));
    summary.evaluations.push({ status: result.status,
      ruleIds: item.prepared.input.rules.map(x => x.id),
      findingIds: result.status === 'evaluated' ? result.findings.map(x => x.ruleId) : [] });
  }
  console.log(JSON.stringify(summary));
}
