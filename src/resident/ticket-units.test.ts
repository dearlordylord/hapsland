import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Effect } from "effect";
import { makeResidentState } from "./capacity.ts";

const revision = Object.freeze({ subject: "fixture", token: "revision-token", generation: 1 });

it.effect("publishes canonical unit progress and immutable native metadata together", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  owner.transition({ kind: "ticketOpen", id: 1 });
  const unit = owner.ticketUnits.add(1);
  expect(Object.isFrozen(unit)).toBe(true);
  expect(unit.stage()?.stage).toBe("pending");
  expect(unit.step("findingResult", "lost", { revision, adviceId: "advice" })).toBe(true);
  expect(unit.stage()?.stage).toBe("finding");
  expect(unit.current).toEqual({ revision, adviceId: "advice" });
  expect(Object.isFrozen(unit.current)).toBe(true);
  expect(unit.step("markDelivered")).toBe(true);
  expect(unit.stage()?.delivered).toBe(true);
  expect(unit.current.adviceId).toBe("advice");
}));

it.effect("rolls back canonical progress when native metadata fails validation", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  owner.transition({ kind: "ticketOpen", id: 1 });
  const unit = owner.ticketUnits.add(1);
  const before = owner.canonicalProjection();
  expect(() => unit.step("findingResult", "lost", { revision })).toThrow("native ticket unit metadata");
  expect(owner.canonicalProjection()).toEqual(before);
  expect(unit.current).toEqual({});
  expect(unit.stage()?.stage).toBe("pending");
  expect(unit.step("findingResult", "lost", { revision, adviceId: "advice" })).toBe(true);
}));

it.effect("does not consume a native unit identity on rejected canonical admission", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  expect(() => owner.ticketUnits.add(99)).toThrow("canonical ticket unit admission refused");
  expect(owner.ticketUnits.values()).toEqual([]);
  owner.transition({ kind: "ticketOpen", id: 1 });
  expect(owner.ticketUnits.add(1).id).toBe(1);
}));

it.effect("fences forgotten and cleared capabilities when numeric unit identities are reused", () => Effect.gen(function* () {
  const owner = yield* makeResidentState();
  owner.transition({ kind: "ticketOpen", id: 1 });
  const old = owner.ticketUnits.add(1);
  old.step("clearResult", "lost", { revision });
  owner.ticketUnits.forget(1);
  expect(old.current).toEqual({});
  expect(old.stage()).toBeUndefined();
  expect(old.step("failUnit", "lost", {})).toBe(false);
  owner.clear();
  owner.transition({ kind: "ticketOpen", id: 1 });
  const replacement = owner.ticketUnits.add(1);
  expect(replacement.id).toBe(old.id);
  expect(old.step("findingResult", "lost", { revision, adviceId: "stale" })).toBe(false);
  expect(replacement.stage()?.stage).toBe("pending");
  expect(replacement.current).toEqual({});
}));
