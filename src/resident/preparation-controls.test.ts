import { expect, it } from "@effect/vitest";
import { Context, Effect, Exit, Fiber, Layer, Ref, Scope } from "effect";
import { ResidentPreparationControls } from "./preparation-controls.ts";
import { makePreparationControls } from "../test-support/preparation-controls.ts";
import { makeResidentRuntime } from "./server.ts";
import { residentPaths } from "./paths.ts";

it.effect("holds one owner while a joining preparation proceeds and releases explicitly", () => Effect.scoped(Effect.gen(function* () {
  const controls = yield* makePreparationControls();
  const service = Context.get(yield* Layer.build(controls.layer), ResidentPreparationControls);
  const completed = yield* Ref.make(false);
  yield* controls.holdNextOwner;
  const owner = yield* Effect.forkChild(service.afterReuseBoundary("ownerClaimed").pipe(
    Effect.andThen(Ref.set(completed, true))), { startImmediately: true });
  yield* controls.ownerEntered;
  yield* service.afterReuseBoundary("claimJoined");
  yield* controls.claimJoined;
  expect(yield* Ref.get(completed)).toBe(false);
  yield* controls.releaseOwner;
  yield* Fiber.join(owner);
  expect(yield* Ref.get(completed)).toBe(true);
  yield* service.afterReuseBoundary("ownerClaimed");
})));

it.effect("interrupts a held owner without requiring an external gate release", () => Effect.scoped(Effect.gen(function* () {
  const controls = yield* makePreparationControls();
  const service = Context.get(yield* Layer.build(controls.layer), ResidentPreparationControls);
  const completed = yield* Ref.make(false);
  yield* controls.holdNextOwner;
  const owner = yield* Effect.forkChild(service.afterReuseBoundary("ownerClaimed").pipe(
    Effect.andThen(Ref.set(completed, true))), { startImmediately: true });
  yield* controls.ownerEntered;
  yield* Fiber.interrupt(owner);
  expect(yield* Ref.get(completed)).toBe(false);
  yield* service.afterReuseBoundary("ownerClaimed");
})));

it.effect("retires fixture gates with their service layer scope", () => Effect.gen(function* () {
  const controls = yield* makePreparationControls();
  const scope = yield* Scope.make();
  const service = Context.get(yield* Layer.buildWithScope(controls.layer, scope), ResidentPreparationControls);
  yield* controls.holdNextOwner;
  const owner = yield* Effect.forkChild(service.afterReuseBoundary("ownerClaimed"), { startImmediately: true });
  yield* controls.ownerEntered;
  yield* Scope.close(scope, Exit.void);
  yield* controls.retired;
  yield* Fiber.join(owner);
}));

it.effect("resident close retires its preparation layer while the caller scope remains open", () => Effect.scoped(Effect.gen(function* () {
  const controls = yield* makePreparationControls();
  const runtime = yield* makeResidentRuntime(residentPaths("/fixture/preparation-controls"), () => 0,
    { preparationControls: controls.layer });
  yield* runtime.closeEffect;
  yield* controls.retired;
})));
