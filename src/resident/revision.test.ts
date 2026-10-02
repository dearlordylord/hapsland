import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Effect } from "effect";
import { freezeInput, freezeRules, semanticIdentity, type PreparedUnit, type TypeDeclaration } from "../direct-event/model.ts";
import { advicee } from "../direct-event/test-fixtures.ts";
import { TYPE_INPUT_CONTRACT } from "../rules/targets.ts";
import { makeResidentState } from "./capacity.ts";

const prepared = (source = "type Count = number"): PreparedUnit => {
  const declaration: TypeDeclaration = { id: "count.ts::Count", kind: "type-alias", name: "Count", source, sourceHash: source };
  const input = freezeInput({
    contract: TYPE_INPUT_CONTRACT, completeness: "complete", path: "count.ts", declaration,
    unit: { root: { artifact: declaration, references: [] } }, rules: freezeRules([]),
    interpretation: "probability-strictly-greater-than-threshold",
  });
  return { root: "/fixture", advicee: advicee({ toolUseId: "edit" }), input, identity: semanticIdentity(input) };
};

it.effect("reuses one native revision and accounts for independent members", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const item = prepared();
  const first = yield* owner.revision.register("agent", item, true, "first-token");
  const joined = yield* owner.revision.register("agent", item, true, "unused-token");
  expect(first.replaced).toBe(true);
  expect(joined).toEqual({ revision: first.revision, replaced: false });
  expect(Object.isFrozen(first.revision)).toBe(true);
  expect(owner.canonicalProjection().revision.entries.map((entry) => entry.members)).toEqual([2]);
  yield* owner.revision.release({ ...first.revision, token: "foreign-token" });
  expect(owner.canonicalProjection().revision.entries.map((entry) => entry.members)).toEqual([2]);
  yield* owner.revision.release(first.revision);
  expect(yield* owner.revision.current(joined.revision, item)).toBe(true);
  expect(owner.canonicalProjection().revision.entries.map((entry) => entry.members)).toEqual([1]);
  yield* owner.revision.release(joined.revision);
  expect(yield* owner.revision.count()).toBe(0);
  expect(yield* owner.revision.current(first.revision, item)).toBe(false);
  expect(yield* owner.revision.generation(first.revision.subject)).toBe(0);
}));

it.effect("replaces only the matching subject and ignores an old generation's release", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const item = prepared();
  const changed = prepared("type Count = string");
  const old = (yield* owner.revision.register("agent", item, true, "old")).revision;
  const independent = (yield* owner.revision.register("other-agent", item, true, "independent")).revision;
  const replacement = (yield* owner.revision.register("agent", changed, true, "replacement")).revision;
  expect(replacement.generation).toBeGreaterThan(old.generation);
  expect(yield* owner.revision.superseded(replacement.subject, old)).toBe(true);
  expect(yield* owner.revision.superseded(replacement.subject, independent)).toBe(false);
  expect(yield* owner.revision.current(old, item)).toBe(false);
  expect(yield* owner.revision.current(replacement, changed)).toBe(true);
  expect(yield* owner.revision.current(independent, item)).toBe(true);
  yield* owner.revision.release(old);
  expect(yield* owner.revision.count()).toBe(2);
  yield* owner.revision.release(independent);
  expect(yield* owner.revision.count()).toBe(1);
  yield* owner.revision.release(replacement);
  expect(yield* owner.revision.count()).toBe(0);
}));

it.effect("isolates acquisitions and fences stale native tokens when generation IDs are reused", () => Effect.gen(function* () {
  const acquire = makeResidentState();
  const first = yield* acquire;
  const second = yield* acquire;
  const item = prepared();
  const old = (yield* first.revision.register("agent", item, true, "old")).revision;
  expect(yield* second.revision.count()).toBe(0);
  expect(yield* second.revision.current(old, item)).toBe(false);
  first.clear();
  expect(yield* first.revision.count()).toBe(0);
  const replacement = (yield* first.revision.register("agent", item, true, "replacement")).revision;
  expect(replacement.generation).toBe(old.generation);
  expect(yield* first.revision.current(old, item)).toBe(false);
  yield* first.revision.release(old);
  expect(yield* first.revision.current(replacement, item)).toBe(true);
  expect(yield* first.revision.count()).toBe(1);
}));


it.effect("settles a retired advice capture and its revision member in one owner commit", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const item = prepared();
  const revision = (yield* owner.revision.register("agent", item, true, "capture")).revision;
  const reservation = owner.reserve("agent", 100, "storedResult");
  if (reservation === undefined) throw new Error("missing capture reservation");
  const capture = yield* owner.adviceCaptures.start(reservation, revision, 200);
  if (capture === undefined) throw new Error("missing capture");
  yield* owner.adviceCaptures.retire(reservation);
  expect(yield* owner.revision.current(revision, item)).toBe(true);
  expect(owner.snapshot().bytes).toBe(300);
  expect(yield* owner.adviceCaptures.finish(capture)).toBe("retired");
  expect(yield* owner.revision.count()).toBe(0);
  expect(owner.snapshot().items).toBe(0);
}));

it.effect("executes deferred registrations atomically across competing members", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const item = prepared();
  const register = owner.revision.register("agent", item, true, "shared-token");
  expect(yield* owner.revision.count()).toBe(0);
  const members = yield* Effect.all(Array.from({ length: 16 }, () => register), { concurrency: 16 });
  expect(members.filter((member) => member.replaced)).toHaveLength(1);
  expect(new Set(members.map((member) => member.revision.token))).toEqual(new Set(["shared-token"]));
  expect(owner.canonicalProjection().revision.entries.map((entry) => entry.members)).toEqual([16]);
  yield* Effect.all(members.map((member) => owner.revision.release(member.revision)), { concurrency: 16 });
  expect(yield* owner.revision.count()).toBe(0);
}));


it.effect("checks supersession and releases against execution-time state", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const item = prepared();
  const old = (yield* owner.revision.register("agent", item, true, "old")).revision;
  const superseded = owner.revision.superseded(old.subject, old);
  const release = owner.revision.release(old);
  expect(yield* owner.revision.count()).toBe(1);
  expect(yield* superseded).toBe(false);
  const replacement = (yield* owner.revision.register("agent", prepared("type Count = string"), true, "new")).revision;
  expect(yield* superseded).toBe(true);
  yield* release;
  expect(yield* owner.revision.count()).toBe(1);
  yield* owner.revision.release(replacement);
  expect(yield* owner.revision.count()).toBe(0);
}));

it.effect("reads revision count at execution without changing the canonical snapshot", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const count = owner.revision.count();
  expect(yield* count).toBe(0);
  const revision = (yield* owner.revision.register("agent", prepared(), true, "count")).revision;
  const before = owner.canonicalProjection();
  expect(yield* count).toBe(1);
  expect(yield* owner.revision.superseded(revision.subject, revision)).toBe(false);
  expect(owner.canonicalProjection()).toEqual(before);
  yield* owner.revision.release(revision);
  expect(yield* count).toBe(0);
}));

it.effect("reads current generation through a reusable snapshot query", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const item = prepared();
  const first = (yield* owner.revision.register("agent", item, true, "first")).revision;
  const generation = owner.revision.generation(first.subject);
  expect(yield* generation).toBe(first.generation);
  const replacement = (yield* owner.revision.register("agent", prepared("type Count = string"), true, "second")).revision;
  const before = owner.canonicalProjection();
  expect(yield* generation).toBe(replacement.generation);
  expect(owner.canonicalProjection()).toEqual(before);
  yield* owner.revision.release(first);
  expect(yield* generation).toBe(replacement.generation);
  yield* owner.revision.release(replacement);
  expect(yield* generation).toBe(0);
}));

it.effect("checks revision currentness at execution and fences reused generations", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  const item = prepared();
  const first = (yield* owner.revision.register("agent", item, true, "old")).revision;
  const current = owner.revision.current(first, item);
  const before = owner.canonicalProjection();
  expect(yield* current).toBe(true);
  expect(owner.canonicalProjection()).toEqual(before);
  owner.clear();
  const next = (yield* owner.revision.register("agent", item, true, "new")).revision;
  expect(next.generation).toBe(first.generation);
  expect(yield* current).toBe(false);
  expect(yield* owner.revision.current(next, item)).toBe(true);
  yield* owner.revision.release(first);
  expect(yield* owner.revision.current(next, item)).toBe(true);
}));
