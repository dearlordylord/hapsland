import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { join } from "node:path";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import type { DirectObservation, DirectRecipient } from "../direct-event/model.ts";
import { addEvent, makeGitFixture, put, recipient } from "../direct-event/test-fixtures.ts";
import { configuredRules } from "../policy/rules.ts";
import { Consent } from "../runtime/consent.ts";
import type { ResidentDispatchContext } from "./protocol.ts";
import {
  MAX_OPERATIONAL_NOTICE_KEYS,
  OPERATIONAL_NOTICE_COOLDOWN_MS,
  ResidentServer,
} from "./server.ts";
import { residentPaths } from "./paths.ts";

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

const collectAndFinalize = async (
  server: ResidentServer,
  observation: DirectObservation,
  context: ResidentDispatchContext,
) => {
  const response = await server.collect(observation.root, observation.recipient, context);
  if (response.status === "advice") {
    expect(server.acknowledge(response.token).status).toBe("acknowledged");
    expect(server.finalize(response.token).status).toBe("finalized");
  }
  return response;
};

describe("resident operational notices", () => {
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
    expect(await server.collect(root, observation.recipient, failed)).toMatchObject({ status: "empty" });
    expect(server.admit(observation, failed).status).toBe("accepted");
    await server.whenIdle();
    expect(await server.collect(root, observation.recipient, failed)).toMatchObject({ status: "empty" });

    now += 1;
    expect(server.admit(observation, failed).status).toBe("accepted");
    await server.whenIdle();
    const boundary = await collectAndFinalize(server, observation, failed);
    expect(boundary.status).toBe("advice");
    if (boundary.status === "advice") {
      expect(boundary.output.hookSpecificOutput.additionalContext).toContain("1 similar failure was suppressed");
    }

    now += OPERATIONAL_NOTICE_COOLDOWN_MS;
    expect(await server.collect(root, observation.recipient, failed)).toMatchObject({ status: "empty" });

    const restarted = new ResidentServer(residentPaths(join(root, "runtime-b")), () => now);
    expect(restarted.admit(observation, failed).status).toBe("accepted");
    await restarted.whenIdle();
    expect((await restarted.collect(root, observation.recipient, failed)).status).toBe("advice");
    await server.close();
    await restarted.close();
  });

  it("keeps capacity/backend and recipient partitions independent and batches with fresh findings", async () => {
    const { root, statePath, observation } = await fixture();
    const failed = dispatch(statePath, { failure: "offline backend" });
    const successful = dispatch(statePath, { answers });
    const oversized = dispatch(statePath, { answers: { oversized: "x".repeat(2 * 1024 * 1024) } });
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => 1_000);

    expect(server.admit(observation, failed).status).toBe("accepted");
    await server.whenIdle();
    expect(server.admit(observation, oversized).status).toBe("rejected-capacity");
    expect(server.admit(observation, successful).status).toBe("accepted");
    await server.whenIdle();
    const combined = await server.collect(root, observation.recipient, successful);
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

    const otherRecipient: DirectRecipient = recipient({
      sessionId: "other-session",
      turnId: "other-turn",
      toolUseId: "other-tool",
    });
    const otherObservation = { ...observation, recipient: otherRecipient };
    expect(server.admit(otherObservation, failed).status).toBe("accepted");
    await server.whenIdle();
    const otherRecipientNotice = await collectAndFinalize(server, otherObservation, failed);
    expect(otherRecipientNotice.status).toBe("advice");

    const second = await fixture();
    const secondFailed = dispatch(second.statePath, { failure: "offline backend" });
    expect(server.admit(second.observation, secondFailed).status).toBe("accepted");
    await server.whenIdle();
    expect(await server.collect(root, observation.recipient, failed)).toMatchObject({ status: "empty" });
    expect((await server.collect(second.root, second.observation.recipient, secondFailed)).status).toBe("advice");
    await server.close();
  });

  it("bounds cooldown retention without evicting an active suppression key", async () => {
    const { root, statePath, observation } = await fixture();
    const oversized = dispatch(statePath, { answers: { oversized: "x".repeat(2 * 1024 * 1024) } });
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => 5_000);

    for (let index = 0; index <= MAX_OPERATIONAL_NOTICE_KEYS; index += 1) {
      const scoped = {
        ...observation,
        recipient: recipient({
          sessionId: `session-${index}`,
          turnId: `turn-${index}`,
          toolUseId: `tool-${index}`,
        }),
      };
      expect(server.admit(scoped, oversized).status).toBe("rejected-capacity");
    }
    expect(server.accountingMetrics()).toMatchObject({
      operationalNoticeKeys: MAX_OPERATIONAL_NOTICE_KEYS,
      pendingOperationalNotices: MAX_OPERATIONAL_NOTICE_KEYS,
    });
    const firstRecipient = recipient({ sessionId: "session-0", turnId: "again", toolUseId: "again" });
    expect(server.admit({ ...observation, recipient: firstRecipient }, oversized).status).toBe("rejected-capacity");
    expect(server.accountingMetrics()).toMatchObject({
      operationalNoticeKeys: MAX_OPERATIONAL_NOTICE_KEYS,
      pendingOperationalNotices: MAX_OPERATIONAL_NOTICE_KEYS,
    });
    expect(server.stats().rejectedCapacity).toBe(MAX_OPERATIONAL_NOTICE_KEYS + 2);
    expect((await server.collect(root, firstRecipient, oversized)).status).toBe("advice");
    await server.close();
  });

  it("does not address unknown recipients or quiet applicability outcomes", async () => {
    const { root, statePath, observation } = await fixture();
    const oversized = dispatch(statePath, { answers: { oversized: "x".repeat(2 * 1024 * 1024) } });
    const server = new ResidentServer(residentPaths(join(root, "runtime")), () => 10);
    const unknown = { ...observation, recipient: { ...observation.recipient, sessionId: "" } };
    expect(server.admit(unknown, oversized).status).toBe("rejected-capacity");
    expect(server.accountingMetrics()).toMatchObject({ operationalNoticeKeys: 0 });

    await put(root, "unrelated.js", "export const value = 1\n");
    const unsupported = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["unrelated.js"])));
    if (unsupported === undefined) throw new Error("unsupported fixture adaptation failed");
    const successful = dispatch(statePath, { answers });
    expect(server.admit(unsupported, successful).status).toBe("accepted");
    await server.whenIdle();
    expect(await server.collect(root, unsupported.recipient, successful)).toMatchObject({ status: "empty" });
    expect(server.accountingMetrics()).toMatchObject({ operationalNoticeKeys: 0 });
    await server.close();
  });
});
