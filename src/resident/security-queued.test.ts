import { reviewControlsLayer } from "../test-support/review-controls.ts";
import { nativeDeferred as deferred } from "../test-support/native-deferred.ts";
import { makeDispatchControls } from "../test-support/dispatch-controls.ts";
import { acquireResidentFixture, type ResidentRuntime } from "./runtime-fixture.ts";
import { afterEach, describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import { addEvent, makeGitFixture, put } from "../direct-event/test-fixtures.ts";
import { residentPaths } from "./paths.ts";

import type { ResidentDispatchContext } from "./protocol.ts";

// Regresses dispatch authorization after a completed policy update. The
// controlled provider writes one line per DecisionModel call.


const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

const setup = async (initiallyExcluded: boolean) => {
  const root = await makeGitFixture();
  directories.push(root);
  await put(root, "type.ts", "type OrderCount = number // QueuedSecurityMarker\n");
  if (initiallyExcluded) await put(root, ".review.jsonc", '{"version":1,"excludes":["type.ts"]}\n');
  const statePath = join(root, "consent");
  const capturePath = join(root, "provider-attempts");
  const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
  if (observation === undefined) throw new Error("synthetic event adaptation failed");
  const dispatch: ResidentDispatchContext = {
    statePath,
    userConfigPath: null,
    credential: null,
    controlled: { capturePath },
  };
  return { root, observation, dispatch, capturePath };
};

const calls = (path: string) => existsSync(path)
  ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).length
  : 0;

describe("queued exclusion authority", () => {
  it("has a provider-attempt positive control", async () => {
    const fixture = await setup(false);
    const server = await acquireResidentFixture(residentPaths(join(fixture.root, "runtime")));
    expect(Effect.runSync(server.admit(fixture.observation, fixture.dispatch)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    expect(calls(fixture.capturePath)).toBe(1);
  }, 30_000);

  it("does not call the provider for an initially excluded candidate", async () => {
    const fixture = await setup(true);
    const server = await acquireResidentFixture(residentPaths(join(fixture.root, "runtime")));
    expect(Effect.runSync(server.admit(fixture.observation, fixture.dispatch)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    expect(calls(fixture.capturePath)).toBe(0);
  }, 30_000);

  it("rejects prepared work after a completed exclusion update", async () => {
    const fixture = await setup(false);
    const entered = deferred();
    const release = deferred();
    let preparedSourceSeen = false;
    const server = await acquireResidentFixture(residentPaths(join(fixture.root, "runtime")), undefined, {
      reviewControls: reviewControlsLayer({ beforeEvaluate: (prepared) => Effect.gen(function* () {
        preparedSourceSeen = prepared.input.declaration.source.includes("QueuedSecurityMarker");
        yield* entered.complete();
        yield* release.wait;
      }) }),
    });
    expect(Effect.runSync(server.admit(fixture.observation, fixture.dispatch)).status).toBe("accepted");
    await entered.promise;
    expect(preparedSourceSeen).toBe(true);
    expect(calls(fixture.capturePath)).toBe(0);
    await put(fixture.root, ".review.jsonc", '{"version":1,"excludes":["type.ts"]}\n');
    release.resolve();
    await Effect.runPromise(server.whenIdle());
    expect(calls(fixture.capturePath)).toBe(0);
  }, 30_000);

  it("rechecks exclusion after the credential-to-dispatch wait", async () => {
    const fixture = await setup(false);
    let preparedSourceSeen = false;
    const controls = await Effect.runPromise(makeDispatchControls());
    await Effect.runPromise(controls.holdNext("credentialResolved"));
    const server = await acquireResidentFixture(residentPaths(join(fixture.root, "runtime")), undefined, {
      reviewControls: reviewControlsLayer({ beforeEvaluate: (prepared) => Effect.gen(function* () {
        preparedSourceSeen = prepared.input.declaration.source.includes("QueuedSecurityMarker");
      }) }),
      dispatchControls: controls.layer,
    });
    expect(Effect.runSync(server.admit(fixture.observation, fixture.dispatch)).status).toBe("accepted");
    expect(await Effect.runPromise(controls.entered)).toBe("credentialResolved");
    expect(preparedSourceSeen).toBe(true);
    await put(fixture.root, ".review.jsonc", '{"version":1,"excludes":["type.ts"]}\n');
    await Effect.runPromise(controls.release);
    await Effect.runPromise(server.whenIdle());
    expect(calls(fixture.capturePath)).toBe(0);
  }, 30_000);
});
