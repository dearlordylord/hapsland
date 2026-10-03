import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { rm } from "node:fs/promises";
import { configuredRules } from "../policy/rules.ts";
import { FUNCTION_INPUT_CONTRACT, FUNCTION_CAPABILITIES } from "../rules/targets.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import { adaptCodexAdd } from "./adapter.ts";
import { prepareObservation, preparedProviderInput } from "./pipeline.ts";
import { addEvent, makeGitFixture, put } from "./test-fixtures.ts";

for (const example of [
  { name: "clock", helper: "export function currentTime() { return Date.now(); }",
    root: "import { currentTime } from './support'; export function check(deadline: number) { return deadline <= currentTime(); }",
    visible: "Date.now" },
  { name: "audit", helper: "const auditEntries: string[] = []; export function recordAudit(text: string) { auditEntries.push(text); }",
    root: "import { recordAudit } from './support'; export function check(text: string) { recordAudit(text); return text.trim(); }",
    visible: "auditEntries.push" },
  { name: "moderation", helper: `
export interface ModerationInput { rawText: string; blockedTerms: string[]; maximumLength: number; submissionId: string }
export interface ModerationDecision { normalizedText: string; status: string; submissionId: string }
const auditEntries: string[] = [];
export function appendAudit(entry: string): void { auditEntries.push(entry); }`,
    root: `import { appendAudit, type ModerationInput, type ModerationDecision } from "./support";
export function check(input: ModerationInput): ModerationDecision {
  const normalizedText = input.rawText.trim();
  const comparable = normalizedText.toLowerCase();
  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));
  const empty = normalizedText.length === 0;
  const tooLong = normalizedText.length > input.maximumLength;
  const status = empty ? "empty" : tooLong ? "too-long" : blocked ? "blocked" : "accepted";
  const submissionId = input.submissionId;
  appendAudit(submissionId + ":" + status + ":" + input.rawText);
  return { normalizedText, status, submissionId };
}`, visible: "term => comparable.includes(term.toLowerCase())" },
]) {
  it.effect(`reviews visible ${example.name} use without claiming complete closure`, () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      try {
        yield* Effect.promise(() => put(root, "support.ts", example.helper));
        yield* Effect.promise(() => put(root, "type.ts", example.root));
        const observation = yield* adaptCodexAdd(addEvent(root));
        expect(observation).toBeDefined();
        if (observation === undefined) return;
        const rule = configuredRules.find(rule => rule.id === "r9_body_reaches_undeclared");
        expect(rule).toBeDefined();
        if (rule === undefined) return;
        const context = { controlledWriter: true, advicee: observation.advicee,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
          inputContract: FUNCTION_INPUT_CONTRACT, rules: [rule] };
        const prepared = yield* prepareObservation(observation, context);
        const ready = prepared.outcomes.find(outcome => outcome.status === "ready");
        expect(ready?.status).toBe("ready");
        if (ready?.status !== "ready") return;
        expect(ready.prepared.input.completeness).toBe("incomplete-irrelevant");
        const evidence = JSON.stringify(ready.prepared.input.unit);
        expect(evidence).toContain(example.visible);
        expect(evidence).toContain('"omitted"');
        const projected = preparedProviderInput(ready.prepared);
        expect(projected).toBeDefined();
        expect(projected?.inputContract.completeness).toBe("incomplete-irrelevant");
        expect(projected?.artifact.source).toBe(ready.prepared.input.declaration.source);
        expect(projected?.evidence.edges.some(edge => edge.kind === "omitted" && edge.symbol === example.visible)).toBe(true);
        // A rule which actually requires closure must still be withheld.
        const strict = { ...rule, reviewTargets: [{ artifactKind: "function" as const,
          inputContract: FUNCTION_INPUT_CONTRACT, capabilities: FUNCTION_CAPABILITIES }] };
        const withheld = yield* prepareObservation(observation, { ...context, rules: [strict] });
        expect(withheld.outcomes.some(outcome => outcome.status === "ready")).toBe(false);
      } finally {
        yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      }
    }),
  );
}
