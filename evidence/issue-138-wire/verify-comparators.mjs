#!/usr/bin/env node
/** Offline proposal derivation only. No Jev client, credential, or network path. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as Effect from "effect/Effect";
import { compileRulePackV2 } from "../../src/rules/compiler.ts";
import { configuredRules } from "../../src/policy/rules.ts";
import { addEvent, makeGitFixture, put } from "../../src/direct-event/test-fixtures.ts";
import { adaptCodexDirectEvent } from "../../src/direct-event/adapter.ts";
import { prepareObservation, preparedProviderInput, encodedFullJevRequestBytes,
  encodedPreparedProviderInputBytes } from "../../src/direct-event/pipeline.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../../src/runtime/review-config.ts";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, "../issue-138-adoption");
const target = join(here, "comparators-proposal.json");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (value) => Buffer.byteLength(value, "utf8");
const exactJsonBytes = (value) => bytes(JSON.stringify(value));
const assert = (fact, reason) => { if (!fact) throw new Error(reason); };
const load = async (path) => JSON.parse(await readFile(path, "utf8"));

/** Proposed #16-style focused hunk: exact changed span, with zero context. */
export const focusedHunk = (path, before, after) => {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  if (oldLines.at(-1) === "") oldLines.pop();
  if (newLines.at(-1) === "") newLines.pop();
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > prefix && newEnd > prefix && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd -= 1; newEnd -= 1;
  }
  assert(oldEnd !== prefix || newEnd !== prefix, "unchanged focused-diff fixture");
  const start = prefix;
  const oldStop = oldEnd;
  const newStop = newEnd;
  const oldStartLine = oldLines.length === 0 ? 0 : start + 1;
  const newStartLine = newLines.length === 0 ? 0 : start + 1;
  const lines = [
    `--- before/${path}`, `+++ after/${path}`,
    `@@ -${oldStartLine},${oldStop - start} +${newStartLine},${newStop - start} @@`,
    ...oldLines.slice(prefix, oldEnd).map((line) => `-${line}`),
    ...newLines.slice(prefix, newEnd).map((line) => `+${line}`),
  ];
  return lines.join("\n");
};

const proposedInput = (arm, source) => ({
  artifact: { domain: "root.ts", source },
  inputContract: {
    id: arm === "focusedDiff" ? "proposal/focused-unified-diff/v1" : "proposal/whole-post-edit-file/v1",
    evidence: arm === "focusedDiff" ? "verified root.ts zero-context edit hunk" : "exact post-edit root.ts file",
  },
});

const v1SourceFieldBytes = (input) => {
  let total = bytes(input.artifact.source);
  const pending = [...input.evidence];
  while (pending.length) {
    const reference = pending.pop();
    if (reference.kind !== "expanded") continue;
    total += bytes(reference.node.artifact.source);
    pending.push(...reference.node.references);
  }
  return total;
};

const record = (arm, providerInput, decision, sourceScope, derivation, measured) => {
  assert(providerInput !== undefined, `${arm}: missing provider input`);
  const localRequest = { input: providerInput, decisions: decision };
  const record = { contractStatus: arm === "v1Type" ? "current-offline-production-path" : "unapproved-comparator-proposal",
    sourceScope, derivation, providerInput, localRequest,
    providerInputBytes: exactJsonBytes(providerInput), localRequestBytes: exactJsonBytes(localRequest),
    providerHttpEnvelopeBytes: null };
  if (measured !== undefined) {
    assert(record.providerInputBytes === measured.providerInputBytes &&
      record.localRequestBytes === measured.localRequestBytes, "production v1 byte accounting mismatch");
  }
  assert(record.localRequestBytes <= 131072, `${arm}: current local gate exceeded`);
  return record;
};

const generate = async () => {
  const manifest = await load(join(corpus, "manifest.json"));
  const pack = await load(join(corpus, "proposed-type-rule-pack-v2.json"));
  const v2Rule = compileRulePackV2(pack, "proposal:issue-138")[0];
  const v1Rule = configuredRules.find((rule) => rule.id === "r2_meaningless_combinations");
  assert(v2Rule && v1Rule, "Noul r2 rule missing");
  assert(JSON.stringify(v2Rule.decision) === JSON.stringify(v1Rule.decision) &&
    v2Rule.threshold === v1Rule.threshold, "v1 and proposed v2 Noul r2 differ");
  const cases = [];
  for (const fixture of manifest.cases.filter((item) => item.branch === "type-shape/v2")) {
    assert(fixture.expectedBand !== null && fixture.labelStatus === "proposed-unverified", `${fixture.id}: no proposed label`);
    for (const item of fixture.sources) {
      const data = await readFile(join(corpus, item.path));
      assert(data.length === item.bytes && hash(data) === item.sha256, `${fixture.id}: source hash mismatch`);
      assert(Buffer.from(data.toString("utf8"), "utf8").equals(data), `${fixture.id}: source not UTF-8`);
    }
    const rootSource = await readFile(join(corpus, "cases", fixture.id, "root.ts"), "utf8");
    const before = fixture.event.kind === "Update" ?
      await readFile(join(corpus, "cases", fixture.id, "root.before.ts"), "utf8") : "";
    const diff = focusedHunk("root.ts", before, rootSource);
    for (const line of fixture.event.patch.split("\n").filter((line) =>
      line.startsWith("+") || line.startsWith("-"))) {
      assert(diff.split("\n").includes(line), `${fixture.id}: focused hunk differs from verified patch`);
    }
    if (fixture.id === "T01" || fixture.id === "T07") {
      assert(!diff.includes("type Status ="), `${fixture.id}: focused diff disclosed unchanged Status`);
    }
    if (fixture.id === "T11" || fixture.id === "T12") {
      assert(bytes(rootSource) > 3 * bytes(diff), `${fixture.id}: whole-file dilution control absent`);
    }
    const decision = { [v2Rule.id]: v2Rule.decision };
    const arms = {
      focusedDiff: record("focusedDiff", proposedInput("focusedDiff", diff), decision,
        { postEditPaths: ["root.ts"], preEditPaths: fixture.event.kind === "Update" ? ["root.ts"] : [],
          supportingPostEditPaths: [], sourceFieldUtf8Bytes: bytes(diff) },
        { algorithm: "focused-unified-zero-context-hunk-proposal/1", sourceHash: hash(diff) }),
      wholeFile: record("wholeFile", proposedInput("wholeFile", rootSource), decision,
        { postEditPaths: ["root.ts"], preEditPaths: [], supportingPostEditPaths: [],
          sourceFieldUtf8Bytes: bytes(rootSource) },
        { algorithm: "exact-post-edit-root-file/1", sourceHash: hash(rootSource) }),
    };
    if (fixture.comparators.v1Type) {
      const root = await makeGitFixture();
      for (const item of fixture.sources) {
        const name = item.path.split("/").at(-1);
        if (name === "root.before.ts") continue;
        await put(root, name, await readFile(join(corpus, item.path)));
      }
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["root.ts"], {
        tool_input: { command: fixture.event.patch }, tool_response: { success: true },
      })));
      assert(observation !== undefined, `${fixture.id}: v1 event not attributed`);
      const prepared = await Effect.runPromise(prepareObservation(observation, {
        controlledWriter: true, advicee: observation.advicee,
        settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION }, rules: [v1Rule],
      }));
      const ready = prepared.outcomes.filter((outcome) => outcome.status === "ready" &&
        outcome.prepared.input.declaration.name === fixture.selectedRoot.name);
      assert(ready.length === 1, `${fixture.id}: expected exactly one selected v1 root`);
      const unit = ready[0].prepared;
      const input = preparedProviderInput(unit);
      const v1Decisions = Object.fromEntries(unit.input.rules.map(({ id, decision }) => [id, decision]));
      assert(Object.keys(v1Decisions).length === 1 &&
        JSON.stringify(Object.values(v1Decisions)[0]) === JSON.stringify(v2Rule.decision),
        `${fixture.id}: v1 decision differs`);
      const visited = new Set();
      const pending = [unit.input.unit.root];
      while (pending.length) {
        const current = pending.pop();
        visited.add(current.artifact.path ?? "root.ts");
        for (const reference of current.references) if (reference.kind === "expanded") pending.push(reference.node);
      }
      assert([...visited].every((path) => path === "root.ts"), `${fixture.id}: v1 scope escaped root.ts`);
      arms.v1Type = record("v1Type", input, v1Decisions,
        { postEditPaths: ["root.ts"], preEditPaths: [],
          supportingPostEditPaths: input.evidence.some((reference) => reference.kind === "expanded") ? ["root.ts"] : [],
          sourceFieldUtf8Bytes: v1SourceFieldBytes(input) },
        { algorithm: "current-v1-preparedProviderInput", selectedRoot: fixture.selectedRoot.name },
        { providerInputBytes: encodedPreparedProviderInputBytes(unit), localRequestBytes: encodedFullJevRequestBytes(unit) });
    }
    assert(fixture.comparators.focusedDiff && fixture.comparators.wholeFile &&
      Boolean(arms.v1Type) === fixture.comparators.v1Type, `${fixture.id}: comparator mismatch`);
    cases.push({ id: fixture.id, category: fixture.category, expectedBand: fixture.expectedBand,
      sourceHashes: fixture.sources.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })),
      patchSha256: hash(fixture.event.patch), arms });
  }
  assert(cases.length === 12 && cases.filter((item) => item.arms.v1Type).length === 9,
    "not 12 type cases and nine v1 comparators");
  return { schemaVersion: 1, status: "unapproved-offline-comparator-proposal",
    corpusManifestSha256: hash(await readFile(join(corpus, "manifest.json"))),
    proposedV2PackSha256: hash(await readFile(join(corpus, "proposed-type-rule-pack-v2.json"))),
    semanticDecision: { questionAndCriteriaIdenticalAcrossArms: true, threshold: v2Rule.threshold,
      v2RuleId: v2Rule.id, currentV1RuleId: v1Rule.id },
    providerHttpEnvelope: { status: "unverified", exactBytes: null },
    provenance: { focusedDiff: "#16 corrected focused-hunk concept, adapted as zero-context T fixture before/after hunk; unapproved new Effect input contract",
      wholeFile: "#16 whole post-edit file scope, adapted to T fixture root.ts; unapproved new Effect input contract",
      v1Type: "current same-file named-type direct-event preparation and preparedProviderInput" },
    cases };
};

const mode = process.argv[2];
assert(mode === "--check" || mode === "--write", "usage: node --experimental-strip-types verify-comparators.mjs --check|--write");
const generated = await generate();
if (mode === "--write") {
  await writeFile(target, `${JSON.stringify(generated, null, 2)}\n`, "utf8");
  console.log(`wrote ${generated.cases.length} offline comparator cases`);
} else {
  const stored = await load(target);
  assert(JSON.stringify(stored) === JSON.stringify(generated), "comparator proposal differs from source-derived bytes");
  console.log(`verified ${generated.cases.length} offline comparator cases, 33 arm inputs`);
}
