import { expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";
import { makeResidentRuntimeConfiguration } from "./runtime-configuration.ts";

it.effect("reads resident diagnostics through the supplied configuration provider", () => Effect.gen(function* () {
  const configuration = yield* makeResidentRuntimeConfiguration().pipe(Effect.provide(
    ConfigProvider.layer(ConfigProvider.fromUnknown({
      REVIEW_RESIDENT_DEBUG: "1",
      REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH: "/fixture/accepted",
      REVIEW_RESIDENT_ADMISSION_TRACE_PATH: "/fixture/trace",
      HAPSLAND_94_SALT: "fixture-salt",
      REVIEW_RESIDENT_COLLECT_DISCONNECT_PATH: "/fixture/disconnected",
    })),
  ));
  expect(configuration).toEqual({
    debug: true, admissionAcceptedPath: "/fixture/accepted", admissionTracePath: "/fixture/trace",
    admissionSalt: "fixture-salt", collectDisconnectPath: "/fixture/disconnected",
  });
  expect(Object.isFrozen(configuration)).toBe(true);
}));

it.effect("isolates provider acquisition and preserves absent diagnostic paths", () => Effect.gen(function* () {
  const acquire = makeResidentRuntimeConfiguration();
  const configured = yield* acquire.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_RESIDENT_DEBUG: "1" }))));
  const defaults = yield* acquire.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))));
  expect(configured.debug).toBe(true);
  expect(defaults).toEqual({ debug: false, admissionAcceptedPath: undefined,
    admissionTracePath: undefined, admissionSalt: undefined, collectDisconnectPath: undefined });
}));
