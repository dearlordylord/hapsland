import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const adapter = read("src/canonical/adapter.ts");
const bend = read("packages/agent-flow-bend/Canonical.bend");
const generated = read("src/canonical/canonical.generated.js");
const declaration = read("src/canonical/canonical.generated.d.ts");
const between = (source, start, end) => {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `missing boundary ${start} → ${end}`);
  return source.slice(first + start.length, last);
};
const matches = (source, expression) => new Set([...source.matchAll(expression)].map((match) => match[1]));
const sameSet = (actual, expected, label) => {
  const missing = [...expected].filter((item) => !actual.has(item));
  const extra = [...actual].filter((item) => !expected.has(item));
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, label);
};
const bendConstructors = (name) => matches(
  between(bend, `type ${name} is Data:`, "\ntype "),
  /^  ([A-Z][A-Za-z0-9_]*)\{/gm,
);

const eventType = between(adapter, "export type CanonicalEvent =", "export type CanonicalCommand =");
const eventKinds = matches(eventType, /readonly kind:\s*([^;]+);/g);
const declaredEventKinds = new Set([...eventKinds].flatMap((kind) =>
  [...kind.matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)].map((match) => match[1])));
const encoder = between(adapter, "const encode = (event: CanonicalEvent)", "const decodeCommand =");
const encodedEventKinds = matches(encoder, /case "([A-Za-z][A-Za-z0-9]*)":/g);
sameSet(encodedEventKinds, declaredEventKinds, "CanonicalEvent kind and encoder case coverage");
assert.match(encoder, /default:\s*throw new TypeError\("unknown canonical event"\)/);

const bendCommands = bendConstructors("Command");
const decodedCommands = matches(between(adapter, "const decodeCommand =", "export type CanonicalProjection ="),
  /case "Canonical\.([A-Z][A-Za-z0-9_]*)"/g);
sameSet(decodedCommands, bendCommands, "Bend Command and runtime decoder coverage");
const commandType = between(adapter, "export type CanonicalCommand =", "export type ProspectiveFacts =");
const commandKindFields = matches(commandType, /readonly kind:\s*([^;]+);/g);
const declaredCommandKinds = new Set([...commandKindFields].flatMap((kind) =>
  [...kind.matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)].map((match) => match[1])));
const bendCommandKinds = new Set([...bendCommands].map((name) => name[0].toLowerCase() + name.slice(1)));
sameSet(declaredCommandKinds, bendCommandKinds, "CanonicalCommand type and Bend Command coverage");
assert.match(adapter, /default:\s*throw new TypeError\("unknown canonical command"\)/);
for (const command of bendCommands) {
  assert.ok(generated.includes(`"Canonical.${command}"`), `compiled Bend lacks Command ${command}`);
}

const consumedTags = matches(adapter, /"((?:Canonical|Ledger|Admission|Work|Dispatch|Collection|Delivery|Revision|Ticket|Reuse|Cache|Notice|Retention|Configuration|RulePolicy)\.[A-Z][A-Za-z0-9_]*)"/g);
// Bend's JS compiler omits literal tags for constructors used only as input
// and for the last arm of a closed Data match. Pin those exact exceptions so a
// changed compiler layout or new consumed constructor forces a review.
const compilerElidedTags = new Set([
  "RulePolicy.Words", "Admission.ProspectiveFacts", "Canonical.StopScope",
  "Retention.CleanupFacts", "Canonical.RetirePartition", "Ticket.Backend",
  "Ticket.Capacity", "Ticket.Stale", "Ticket.Lost", "Delivery.SubmissionFacts",
]);
const missingTags = new Set([...consumedTags].filter((name) => !generated.includes(`"${name}"`)));
sameSet(missingTags, compilerElidedTags, "compiled Bend tag exceptions");
const declaredExports = matches(declaration, /^export declare const (bendCanonical[A-Za-z0-9]+):/gm);
const compiledExports = matches(generated, /^export const (bendCanonical[A-Za-z0-9]+) =/gm);
sameSet(declaredExports, compiledExports, "generated declarations and compiled exports");
assert.deepEqual([...declaredExports].sort(), [
  "bendCanonicalInitial", "bendCanonicalInventory", "bendCanonicalPartitionUsage",
  "bendCanonicalStep", "bendCanonicalTotal",
].sort());
assert.match(adapter, /const MAX_NAT = 2 \*\* 48 - 1;/);
assert.match(adapter, /export const CANONICAL_MAX_BYTES = 2 \*\* 47 - 1;/);
assert.match(adapter, /export const CANONICAL_MAX_UNITS = 1024;/);
assert.match(adapter, /default: throw new TypeError\("unknown canonical step"\)/);
console.log(`checked ${declaredEventKinds.size} event kinds, ${bendCommands.size} command variants, ${consumedTags.size} consumed tags, and ${declaredExports.size} compiled exports`);
