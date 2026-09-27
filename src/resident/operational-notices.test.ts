import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import type { DirectObservation, DirectAdvicee } from "../direct-event/model.ts";
import { addEvent, makeGitFixture, put, advicee } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { Consent } from "../runtime/consent.ts";
import type { ResidentDispatchContext } from "./protocol.ts";
import {
  MAX_OPERATIONAL_NOTICE_KEYS,
  OPERATIONAL_NOTICE_COOLDOWN_MS,
  ResidentServer,
} from "./server.ts";
import { residentPaths } from "./paths.ts";
import { PENDING_ADVICE_EXPIRY_MS } from "./collection.ts";
import { operationalNoticeAdmission } from "./operational-notice-policy.ts";

const enable = (root: string, statePath: string) => Effect.runPromise(Effect.gen(function* () {
  const consent = yield* Consent.Service;
  const proposal = yield* consent.preview(root, "jev", "https://api.typesafe.ai/v1/systemone");
  yield* consent.enable(proposal);
}).pipe(Effect.provide(Consent.layer({ statePath }))));

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
  await enable(root, statePath);
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
  server: ResidentServer,
  observation: DirectObservation,
  context: ResidentDispatchContext,
) => {
  const response = await server.collect(observation.root, observation.advicee, context);
  if (response.status === "advice") {
    expect(server.acknowledge(response.token).status).toBe("acknowledged");
    expect(server.finalize(response.token).status).toBe("finalized");
  }
  return response;
};

const fillAndFinalizeCooldownTable = async (
  server: ResidentServer,
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
    expect(server.admit(scoped, context).status).toBe("accepted");
    await server.whenIdle();
  }
  expect(server.accountingMetrics()).toMatchObject({
    operationalNoticeKeys: maximumKeys,
    pendingOperationalNotices: maximumKeys,
  });
  for (const scoped of scopes) {
    const notice = await collectAndFinalize(server, scoped, context);
    expect(notice.status).toBe("advice");
  }
  expect(server.accountingMetrics()).toMatchObject({
    operationalNoticeKeys: maximumKeys,
    pendingOperationalNotices: 0,
  });
  return scopes;
};

describe("resident operational notices", () => {
  it("returns bounded actionable advice when native credential access requires interaction", async () => {
    const { root, statePath, observation } = await fixture();
    const helper = join(root, "credential-helper.mjs");
    const credentialStatePath = join(root, "credential-state.json");
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
      controlled: { answers, requireCredential: true },
    };
    const server = new ResidentServer(residentPaths(join(root, "runtime")));
    try {
      expect(server.admit(observation, context).status).toBe("accepted");
      await server.whenIdle();
      const result = await collectAndFinalize(server, observation, context);
      expect(result.status).toBe("advice");
      if (result.status === "advice") {
        const text = result.output.hookSpecificOutput.additionalContext;
        expect(text).toContain("saved review credential was unavailable");
        expect(text).toContain("Background hooks never prompt");
        expect(Buffer.byteLength(JSON.stringify(result.output))).toBeLessThanOrEqual(2 * 1024);
      }
    } finally {
      await server.close();
      if (previousHelper === undefined) delete process.env.REVIEW_CREDENTIAL_HELPER;
      else process.env.REVIEW_CREDENTIAL_HELPER = previousHelper;
    }
  });

  it("uses an exact failure-triggered cooldown and resets state on restart", async () => {
    const { root, statePath, observation } = await fixture();
    const failed = dispatch(statePath, { failure: "offline backend" });
    let now = 100;
    const server = new ResidentServer(residentPaths(join(root, "runtime-a")), () => now);

    expect(server.admit(observation, failed).status).toBe("accepted");
    await server.whenIdle();
    const first = await collectAndFinalize(server, observation, failed);
    expect(first.status).toBe("advice");
    if (first.status === "advice") {
      expect(first.output.hookSpecificOutput.additionalContext).toContain("Jev was unavailable");
    }

    now += OPERATIONAL_NOTICE_COOLDOWN_MS - 1;
    expect(await server.collect(root, observation.advicee, failed)).toMatchObject({ status: "empty" });
    expect(server.admit(observation, failed).status).toBe("accepted");
    await server.whenIdle();
    expect(await server.collect(root, observation.advicee, failed)).toMatchObject({ status: "empty" });

    now += 1;
    expect(server.admit(observation, failed).status).toBe("accepted");
    await server.whenIdle();
    const boundary = await collectAndFinalize(server, observation, failed);
    expect(boundary.status).toBe("advice");
    if (boundary.status === "advice") {
      expect(boundary.output.hookSpecificOutput.additionalContext).toContain("Jev was unavailable");
    }

    now += OPERATIONAL_NOTICE_COOLDOWN_MS;
    expect(await server.collect(root, observation.advicee, failed)).toMatchObject({ status: "empty" });

    const restarted = new ResidentServer(residentPaths(join(root, "runtime-b")), () => now);
    expect(restarted.admit(observation, failed).status).toBe("accepted");
    await restarted.whenIdle();
    expect((await restarted.collect(root, observation.advicee, failed)).status).toBe("advice");
    await server.close();
    await restarted.close();
  });

  it("keeps capacity/backend and advicee partitions independent and batches with fresh findings", async () => {
    const { root, statePath, observation } = await fixture();
    const failed = dispatch(statePath, { failure: "offline backend" });
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => 1_000);

    expect(server.admit(observation, failed).status).toBe("accepted");
    await server.whenIdle();
    await installCapacityRule(root);
    expect(server.admit(observation, capacityDispatch(statePath)).status).toBe("accepted");
    await server.whenIdle();
    await installCapacityRule(root, 0.7, 32);
    expect(server.admit(observation, capacityDispatch(statePath)).status).toBe("accepted");
    await server.whenIdle();
    const combined = await server.collect(root, observation.advicee, capacityDispatch(statePath));
    expect(combined.status).toBe("advice");
    if (combined.status === "advice") {
      const text = combined.output.hookSpecificOutput.additionalContext;
      expect(text).toContain("type.ts :: OrderCount");
      expect(text).toContain("review capacity was unavailable");
      expect(text).toContain("Jev was unavailable");
      expect(text.indexOf("type.ts :: OrderCount")).toBeLessThan(text.indexOf("Operational notice"));
      expect(server.acknowledge(combined.token).status).toBe("acknowledged");
      expect(server.finalize(combined.token).status).toBe("finalized");
    }

    const otherAdvicee: DirectAdvicee = advicee({
      sessionId: "other-session",
      turnId: "other-turn",
      toolUseId: "other-tool",
    });
    const otherObservation = { ...observation, advicee: otherAdvicee };
    expect(server.admit(otherObservation, failed).status).toBe("accepted");
    await server.whenIdle();
    const otherAdviceeNotice = await collectAndFinalize(server, otherObservation, failed);
    expect(otherAdviceeNotice.status).toBe("advice");

    const second = await fixture();
    const secondFailed = dispatch(second.statePath, { failure: "offline backend" });
    expect(server.admit(second.observation, secondFailed).status).toBe("accepted");
    await server.whenIdle();
    expect(await server.collect(root, observation.advicee, failed)).toMatchObject({ status: "empty" });
    expect((await server.collect(second.root, second.observation.advicee, secondFailed)).status).toBe("advice");
    await server.close();
  });

  it("reclaims a full cooldown table at equality before the next admission", async () => {
    const { root, statePath, observation } = await fixture();
    await installCapacityRule(root);
    const capacity = capacityDispatch(statePath);
    let now = 5_000;
    const maximumKeys = 2;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => now, {
      maximumOperationalNoticeKeys: maximumKeys,
    });

    await fillAndFinalizeCooldownTable(server, observation, capacity, maximumKeys);

    now += OPERATIONAL_NOTICE_COOLDOWN_MS;
    await installCapacityRule(root, 0.7, 32);
    expect(server.admit(observation, capacityDispatch(statePath)).status).toBe("accepted");
    expect(server.accountingMetrics()).toMatchObject({ operationalNoticeKeys: 0 });
    await server.whenIdle();
    await server.close();

    await installCapacityRule(root);
    let excludedNow = 50_000;
    const excludedServer = new ResidentServer(
      residentPaths(join(root, "runtime-excluded")),
      () => excludedNow,
      { maximumOperationalNoticeKeys: maximumKeys },
    );
    await fillAndFinalizeCooldownTable(excludedServer, observation, capacity, maximumKeys);
    await put(root, ".env.local", "SECRET=not-read\n");
    const excluded = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [".env.local"])));
    if (excluded === undefined) throw new Error("excluded fixture adaptation failed");
    expect(excludedServer.admit(excluded, capacity).status).toBe("accepted");
    await excludedServer.whenIdle();
    expect(await excludedServer.collect(root, excluded.advicee, capacity)).toMatchObject({ status: "empty" });
    expect(excludedServer.accountingMetrics()).toMatchObject({
      operationalNoticeKeys: maximumKeys,
      pendingOperationalNotices: 0,
    });
    excludedNow += OPERATIONAL_NOTICE_COOLDOWN_MS;
    expect(excludedServer.admit(excluded, capacity).status).toBe("accepted");
    await excludedServer.whenIdle();
    expect(await excludedServer.collect(root, excluded.advicee, capacity)).toMatchObject({ status: "empty" });
    expect(excludedServer.accountingMetrics()).toMatchObject({ operationalNoticeKeys: 0 });
    await excludedServer.close();
  });

  it("preserves active suppression under full-table pressure from another eligible key", () => {
    const nextAllowedByKey = new Map<string, number>(
      Array.from({ length: MAX_OPERATIONAL_NOTICE_KEYS }, (_, index) => [
        `eligible-partition-${index}`,
        OPERATIONAL_NOTICE_COOLDOWN_MS,
      ] as const),
    );
    const pressure = operationalNoticeAdmission({
      now: 1,
      existingNextAllowedAt: nextAllowedByKey.get("another-eligible-partition"),
      keyCount: nextAllowedByKey.size,
      maximumKeys: MAX_OPERATIONAL_NOTICE_KEYS,
    });
    expect(pressure).toEqual({ action: "reject-full", emit: false });
    expect(nextAllowedByKey.size).toBe(MAX_OPERATIONAL_NOTICE_KEYS);

    const existingKey = "eligible-partition-0";
    const repeated = operationalNoticeAdmission({
      now: OPERATIONAL_NOTICE_COOLDOWN_MS - 1,
      existingNextAllowedAt: nextAllowedByKey.get(existingKey),
      keyCount: nextAllowedByKey.size,
      maximumKeys: MAX_OPERATIONAL_NOTICE_KEYS,
    });
    expect(repeated).toEqual({ action: "suppress", emit: false });
    expect(nextAllowedByKey.get(existingKey)).toBe(OPERATIONAL_NOTICE_COOLDOWN_MS);
    expect(nextAllowedByKey.size).toBe(MAX_OPERATIONAL_NOTICE_KEYS);
  });

  it("keeps a fractional-time notice cooldown until the exact deadline", () => {
    expect(operationalNoticeAdmission({ now: 10.0001,
      existingNextAllowedAt: 10.0009, keyCount: 1, maximumKeys: 64 }))
      .toEqual({ action: "suppress", emit: false });
    expect(operationalNoticeAdmission({ now: 10.0009,
      existingNextAllowedAt: 10.0009, keyCount: 1, maximumKeys: 64 }))
      .toEqual({ action: "refresh", emit: true });
  });

  it("reclaims pending notice state at the exact expiry boundary", async () => {
    const { root, statePath, observation } = await fixture();
    const failed = dispatch(statePath, { failure: "offline backend" });
    let now = 20;
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => now);
    expect(server.admit(observation, failed).status).toBe("accepted");
    await server.whenIdle();
    expect(server.accountingMetrics()).toMatchObject({ operationalNoticeKeys: 1, pendingOperationalNotices: 1 });

    now += PENDING_ADVICE_EXPIRY_MS;
    expect(server.admit(observation, dispatch(statePath, { answers })).status).toBe("accepted");
    expect(server.accountingMetrics()).toMatchObject({ operationalNoticeKeys: 0, pendingOperationalNotices: 0 });
    await server.whenIdle();
    await server.close();
  });

  it("does not address unknown advicees or quiet applicability outcomes", async () => {
    const { root, statePath, observation } = await fixture();
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => 10);
    const oversized = dispatch(statePath, { answers: { oversized: "x".repeat(2 * 1024 * 1024) } });
    const unknown = { ...observation, advicee: { ...observation.advicee, sessionId: "" } };
    expect(server.admit(unknown, oversized).status).toBe("rejected-capacity");
    expect(server.accountingMetrics()).toMatchObject({ operationalNoticeKeys: 0 });

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
    expect(server.admit(unsupported, capacity).status).toBe("accepted");
    await server.whenIdle();
    const unsupportedOperation = {
      ...observation,
      candidates: [{ operation: "delete" as const, path: "type.ts", addedLines: [] as const }],
    };
    expect(server.admit(unsupportedOperation, capacity).status).toBe("accepted");
    await server.whenIdle();
    expect(await server.collect(root, unsupported.advicee, capacity)).toMatchObject({ status: "empty" });
    expect(server.accountingMetrics()).toMatchObject({ operationalNoticeKeys: 0 });
    await server.close();
  });
});
