import { acquireResidentFixture, type ResidentRuntime } from "./runtime-fixture.ts";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { existsSync } from "node:fs";
import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import type { DirectObservation, DirectAdvicee } from "../direct-event/model.ts";
import { addEvent, makeGitFixture, put, advicee } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import type { ResidentDispatchContext } from "./protocol.ts";
import {
  MAX_OPERATIONAL_NOTICE_KEYS,
  OPERATIONAL_NOTICE_COOLDOWN_MS,
} from "./server.ts";
import { residentPaths } from "./paths.ts";
import { PENDING_ADVICE_EXPIRY_MS } from "./collection.ts";
import { initialCanonical, projectCanonical, stepCanonical } from "../canonical/adapter.ts";

const answers = Object.fromEntries(configuredRules.map((rule) => [
  rule.id,
  { _tag: "Probability" as const, probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 },
]));

const dispatch = (
  statePath: string,
  controlled: NonNullable<ResidentDispatchContext["controlled"]>,
): ResidentDispatchContext => ({
  statePath,
  userConfigPath: null,
  credential: null,
  controlled,
});

const fixture = async () => {
  const root = await makeGitFixture();
  await put(root, "type.ts", "type OrderCount = number\n");
  const statePath = join(root, "consent");
  const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
  if (observation === undefined) throw new Error("fixture adaptation failed");
  return { root, statePath, observation };
};

const installCapacityRule = async (root: string, threshold = 0.7, messageBytes = 300 * 1024) => {
  await put(root, "rules.jsonc", JSON.stringify({
    schemaVersion: 1,
    id: "team",
    contentVersion: "1",
    rules: [{
      id: "large",
      question: "Does this declaration need review?",
      criteria: { false: "No", true: "Yes" },
      threshold,
      message: "x".repeat(messageBytes),
      applicability: { includes: ["**/*.ts"] },
      reviewTargets: [{ artifactKind: "typeShape", inputContract: "direct-event/type-shape/v1",
        capabilities: ["root-declaration", "resolved-outbound-types"] }],
    }],
  }));
  await put(root, ".review.jsonc", JSON.stringify({ version: 1, packs: ["rules.jsonc"] }));
};

const capacityDispatch = (statePath: string): ResidentDispatchContext => dispatch(statePath, {
  answers: {
    ...answers,
    "team/large": { _tag: "Probability", probability: 1 },
  },
});

const collectAndFinalize = async (
  server: ResidentRuntime,
  observation: DirectObservation,
  context: ResidentDispatchContext,
) => {
  const response = await server.collect(observation.root, observation.advicee, context);
  if (response.status === "advice") {
    expect((await Effect.runPromise(server.acknowledge(response.token))).status).toBe("acknowledged");
    expect((await Effect.runPromise(server.finalize(response.token))).status).toBe("finalized");
  }
  return response;
};

const fillAndFinalizeCooldownTable = async (
  server: ResidentRuntime,
  observation: DirectObservation,
  context: ResidentDispatchContext,
  maximumKeys = MAX_OPERATIONAL_NOTICE_KEYS,
) => {
  const scopes: Array<DirectObservation> = [];
  for (let index = 0; index < maximumKeys; index += 1) {
    const scoped = {
      ...observation,
      advicee: advicee({
        sessionId: `session-${index}`,
        turnId: `turn-${index}`,
        toolUseId: `tool-${index}`,
      }),
    };
    scopes.push(scoped);
    expect(Effect.runSync(server.admit(scoped, context)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
  }
  expect((await Effect.runPromise(server.accountingMetrics()))).toMatchObject({
    operationalNoticeKeys: maximumKeys,
    pendingOperationalNotices: maximumKeys,
  });
  for (const scoped of scopes) {
    const notice = await collectAndFinalize(server, scoped, context);
    expect(notice.status).toBe("empty");
  }
  expect((await Effect.runPromise(server.accountingMetrics()))).toMatchObject({
    operationalNoticeKeys: maximumKeys,
    pendingOperationalNotices: maximumKeys,
  });
  return scopes;
};

describe("resident operational notices", () => {
  it("keeps credential failures in diagnostics instead of agent output", async () => {
    const { root, statePath, observation } = await fixture();
    const helper = join(root, "credential-helper.mjs");
    const credentialStatePath = join(root, "credential-state.json");
    const capturePath = join(root, "backend-called.json");
    await writeFile(helper, `#!/usr/bin/env node
console.log('{"version":1,"status":"interaction-required"}');
`, { mode: 0o700 });
    await writeFile(credentialStatePath, JSON.stringify({
      version: 1,
      generation: 1,
      savedUseSuspended: false,
    }));
    const previousHelper = process.env.REVIEW_CREDENTIAL_HELPER;
    process.env.REVIEW_CREDENTIAL_HELPER = helper;
    const context: ResidentDispatchContext = {
      statePath,
      userConfigPath: null,
      credential: {
        name: "TYPESAFE_API_KEY",
        environmentValue: null,
        environmentOnly: false,
        generation: 1,
        statePath: credentialStatePath,
      },
      controlled: { answers, requireCredential: true, capturePath },
    };
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")));
    try {
      expect(Effect.runSync(server.admit(observation, context)).status).toBe("accepted");
      await Effect.runPromise(server.whenIdle());
      const result = await collectAndFinalize(server, observation, context);
      expect(result.status).toBe("empty");
      expect(existsSync(capturePath)).toBe(false);
      expect((await Effect.runPromise(server.accountingMetrics()))).toMatchObject({ operationalNoticeKeys: 1, pendingOperationalNotices: 1 });
    } finally {
      await Effect.runPromise(server.close);
      if (previousHelper === undefined) delete process.env.REVIEW_CREDENTIAL_HELPER;
      else process.env.REVIEW_CREDENTIAL_HELPER = previousHelper;
    }
  });

  it("uses an exact failure-triggered cooldown and resets state on restart", async () => {
    const { root, statePath, observation } = await fixture();
    const failed = dispatch(statePath, { failure: "offline backend" });
    let now = 100;
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime-a")), () => now);

    expect(Effect.runSync(server.admit(observation, failed)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    const first = await collectAndFinalize(server, observation, failed);
    expect(first.status).toBe("empty");
    expect((await Effect.runPromise(server.accountingMetrics()))).toMatchObject({ operationalNoticeKeys: 1, pendingOperationalNotices: 1 });

    now += OPERATIONAL_NOTICE_COOLDOWN_MS - 1;
    expect(await server.collect(root, observation.advicee, failed)).toMatchObject({ status: "empty" });
    expect(Effect.runSync(server.admit(observation, failed)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    expect(await server.collect(root, observation.advicee, failed)).toMatchObject({ status: "empty" });

    now += 1;
    expect(Effect.runSync(server.admit(observation, failed)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    const boundary = await collectAndFinalize(server, observation, failed);
    expect(boundary.status).toBe("empty");

    now += OPERATIONAL_NOTICE_COOLDOWN_MS;
    expect(await server.collect(root, observation.advicee, failed)).toMatchObject({ status: "empty" });

    const restarted = await acquireResidentFixture(residentPaths(join(root, "runtime-b")), () => now);
    expect(Effect.runSync(restarted.admit(observation, failed)).status).toBe("accepted");
    await Effect.runPromise(restarted.whenIdle());
    expect((await restarted.collect(root, observation.advicee, failed)).status).toBe("empty");
    await Effect.runPromise(server.close);
    await Effect.runPromise(restarted.close);
  });

  it("keeps repeated failures in internal cooldown state without agent output", async () => {
    const { root, statePath, observation } = await fixture();
    const failed = dispatch(statePath, { failure: "offline backend" });
    let now = 100;
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => now);
    expect(Effect.runSync(server.admit(observation, failed)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    now += OPERATIONAL_NOTICE_COOLDOWN_MS - 1;
    expect(Effect.runSync(server.admit(observation, failed)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    now += 1;
    expect(Effect.runSync(server.admit(observation, failed)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    const result = await collectAndFinalize(server, observation, failed);
    expect(result.status).toBe("empty");
    expect((await Effect.runPromise(server.accountingMetrics()))).toMatchObject({ operationalNoticeKeys: 1, pendingOperationalNotices: 1 });
    await Effect.runPromise(server.close);
  });

  it("keeps capacity/backend records separate while emitting only fresh findings", async () => {
    const { root, statePath, observation } = await fixture();
    const failed = dispatch(statePath, { failure: "offline backend" });
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 1_000);

    expect(Effect.runSync(server.admit(observation, failed)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    await installCapacityRule(root);
    expect(Effect.runSync(server.admit(observation, capacityDispatch(statePath))).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    await installCapacityRule(root, 0.7, 32);
    expect(Effect.runSync(server.admit(observation, capacityDispatch(statePath))).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    const combined = await server.collect(root, observation.advicee, capacityDispatch(statePath));
    expect(combined.status).toBe("advice");
    if (combined.status === "advice") {
      const text = combined.output.hookSpecificOutput.additionalContext;
      expect(text).toContain("type.ts :: OrderCount");
      expect(text).not.toContain("Operational notice");
      expect((await Effect.runPromise(server.acknowledge(combined.token))).status).toBe("acknowledged");
      expect((await Effect.runPromise(server.finalize(combined.token))).status).toBe("finalized");
    }

    const otherAdvicee: DirectAdvicee = advicee({
      sessionId: "other-session",
      turnId: "other-turn",
      toolUseId: "other-tool",
    });
    const otherObservation = { ...observation, advicee: otherAdvicee };
    expect(Effect.runSync(server.admit(otherObservation, failed)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    const otherAdviceeNotice = await collectAndFinalize(server, otherObservation, failed);
    expect(otherAdviceeNotice.status).toBe("empty");

    const second = await fixture();
    const secondFailed = dispatch(second.statePath, { failure: "offline backend" });
    expect(Effect.runSync(server.admit(second.observation, secondFailed)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    expect(await server.collect(root, observation.advicee, failed)).toMatchObject({ status: "empty" });
    expect((await server.collect(second.root, second.observation.advicee, secondFailed)).status).toBe("empty");
    await Effect.runPromise(server.close);
  });

  it("reclaims a full cooldown table at equality before the next admission", async () => {
    const { root, statePath, observation } = await fixture();
    await installCapacityRule(root);
    const capacity = capacityDispatch(statePath);
    let now = 5_000;
    const maximumKeys = 2;
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => now, {
      maximumOperationalNoticeKeys: maximumKeys,
    });

    await fillAndFinalizeCooldownTable(server, observation, capacity, maximumKeys);

    now += PENDING_ADVICE_EXPIRY_MS;
    await installCapacityRule(root, 0.7, 32);
    expect(Effect.runSync(server.admit(observation, capacityDispatch(statePath))).status).toBe("accepted");
    expect((await Effect.runPromise(server.accountingMetrics()))).toMatchObject({ operationalNoticeKeys: 0 });
    await Effect.runPromise(server.whenIdle());
    await Effect.runPromise(server.close);

    await installCapacityRule(root);
    let excludedNow = 50_000;
    const excludedServer = await acquireResidentFixture(
      residentPaths(join(root, "runtime-excluded")),
      () => excludedNow,
      { maximumOperationalNoticeKeys: maximumKeys },
    );
    await fillAndFinalizeCooldownTable(excludedServer, observation, capacity, maximumKeys);
    await put(root, ".env.local", "SECRET=not-read\n");
    const excluded = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [".env.local"])));
    if (excluded === undefined) throw new Error("excluded fixture adaptation failed");
    expect(Effect.runSync(excludedServer.admit(excluded, capacity)).status).toBe("accepted");
    await Effect.runPromise(excludedServer.whenIdle());
    expect(await excludedServer.collect(root, excluded.advicee, capacity)).toMatchObject({ status: "empty" });
    expect((await Effect.runPromise(excludedServer.accountingMetrics()))).toMatchObject({
      operationalNoticeKeys: maximumKeys,
      pendingOperationalNotices: maximumKeys,
    });
    excludedNow += PENDING_ADVICE_EXPIRY_MS;
    expect(Effect.runSync(excludedServer.admit(excluded, capacity)).status).toBe("accepted");
    await Effect.runPromise(excludedServer.whenIdle());
    expect(await excludedServer.collect(root, excluded.advicee, capacity)).toMatchObject({ status: "empty" });
    expect((await Effect.runPromise(excludedServer.accountingMetrics()))).toMatchObject({ operationalNoticeKeys: 0 });
    await Effect.runPromise(excludedServer.close);
  });

  it("saturates canonical suppression counts and keeps a leased pending notice stable", () => {
    let state = initialCanonical({ globalItems: 4, globalBytes: 1000, partitionItems: 4, partitionBytes: 1000 });
    const apply = (event: Parameters<typeof stepCanonical>[1]) => {
      const result = stepCanonical(state, event);
      state = result.state;
      return result.commands[0];
    };
    expect(apply({ kind: "reserveCapacity", partition: 1, bytes: 20,
      purpose: "operationalNotice" })?.kind).toBe("capacityGranted");
    expect(apply({ kind: "noticeCommit", key: 1, partition: 1, group: 1,
      reservation: 1, pending: 1, sequence: 1, maximumKeys: 4 })?.kind).toBe("noticeCommitted");
    const suppressed = { kind: "noticeAdvance" as const, key: 1, remaining: 1,
      maximumKeys: 4, proposed: 2, sequence: 2, maxCount: 2 };
    expect(apply(suppressed)).toEqual({ kind: "noticeSuppressed", count: 1 });
    expect(apply(suppressed)).toEqual({ kind: "noticeSuppressed", count: 2 });
    expect(apply(suppressed)).toEqual({ kind: "noticeSuppressed", count: 2 });
    expect(apply({ ...suppressed, remaining: 0 })).toEqual({ kind: "noticeMergePending", count: 2 });
    expect(apply({ kind: "noticeLease", key: 1, leased: true })?.kind).toBe("noticeLeased");
    expect(apply({ ...suppressed, remaining: 0 })?.kind).toBe("noticeKeepLeased");
    expect(projectCanonical(state).notices[0]).toMatchObject({
      suppressed: 0, pending: { id: 1, count: 2, leased: true },
    });
  });

  it("reclaims pending notice state at the exact expiry boundary", async () => {
    const { root, statePath, observation } = await fixture();
    const failed = dispatch(statePath, { failure: "offline backend" });
    let now = 20;
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => now);
    expect(Effect.runSync(server.admit(observation, failed)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    expect((await Effect.runPromise(server.accountingMetrics()))).toMatchObject({ operationalNoticeKeys: 1, pendingOperationalNotices: 1 });

    now += PENDING_ADVICE_EXPIRY_MS;
    expect(Effect.runSync(server.admit(observation, dispatch(statePath, { answers }))).status).toBe("accepted");
    expect((await Effect.runPromise(server.accountingMetrics()))).toMatchObject({ operationalNoticeKeys: 0, pendingOperationalNotices: 0 });
    await Effect.runPromise(server.whenIdle());
    await Effect.runPromise(server.close);
  });

  it("does not address unknown advicees or quiet applicability outcomes", async () => {
    const { root, statePath, observation } = await fixture();
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => 10);
    const oversized = dispatch(statePath, { answers: { oversized: "x".repeat(2 * 1024 * 1024) } });
    const unknown = { ...observation, advicee: { ...observation.advicee, sessionId: "" } };
    expect(Effect.runSync(server.admit(unknown, oversized)).status).toBe("accepted");
    expect((await Effect.runPromise(server.accountingMetrics()))).toMatchObject({ operationalNoticeKeys: 0 });

    await installCapacityRule(root);
    await put(root, ".env.local", "SECRET=not-read\n");
    await put(root, "node_modules/dependency.ts", "type Dependency = number\n");
    await put(root, ".gitignore", "ignored.ts\n");
    await put(root, "ignored.ts", "type Ignored = number\n");
    await put(root, "unrelated.js", "export const value = 1\n");
    await put(root, "bad.ts", "type = ;\n");
    await put(root, "real/type.ts", "type Linked = number\n");
    await symlink("real", join(root, "link"));
    await put(root, "../outside.ts", "type Outside = number\n");
    const unsupported = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [
      ".env.local",
      "node_modules/dependency.ts",
      ".git/config",
      "ignored.ts",
      "../outside.ts",
      "link/type.ts",
      "unrelated.js",
      "bad.ts",
    ])));
    if (unsupported === undefined) throw new Error("unsupported fixture adaptation failed");
    const capacity = capacityDispatch(statePath);
    expect(Effect.runSync(server.admit(unsupported, capacity)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    const unsupportedOperation = {
      ...observation,
      candidates: [{ operation: "delete" as const, path: "type.ts", addedLines: [] as const }],
    };
    expect(Effect.runSync(server.admit(unsupportedOperation, capacity)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    expect(await server.collect(root, unsupported.advicee, capacity)).toMatchObject({ status: "empty" });
    expect((await Effect.runPromise(server.accountingMetrics()))).toMatchObject({ operationalNoticeKeys: 0 });
    await Effect.runPromise(server.close);
  });
});
