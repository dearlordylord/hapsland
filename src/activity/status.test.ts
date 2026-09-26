import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DirectAdvicee } from "../direct-event/model.ts";
import {
  MAX_ACTIVITY_EVENTS_PER_SESSION,
  MAX_ACTIVITY_MARKERS_PER_EVENT,
  readActivity,
  recordActivity,
  type ActivityStage,
} from "./status.ts";

const roots: Array<string> = [];
const makeRoot = () => {
  const root = mkdtempSync(join(tmpdir(), "resident-activity-"));
  roots.push(root);
  return root;
};
const advicee = (sessionId: string, toolUseId: string, subagentId: string | null = null): DirectAdvicee => ({
  host: "codex-cli",
  hostVersion: "0.155.1",
  sessionId,
  turnId: `turn-${toolUseId}`,
  toolUseId,
  subagentId,
});

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("resident activity status", () => {
  it("distinguishes every production stage, submission, and absent model-reaction evidence", () => {
    const statePath = makeRoot();
    const root = "/synthetic/repository";
    const lifetime = "resident-a";
    const stages: ReadonlyArray<ActivityStage> = [
      "skipped", "pending", "clear", "findings", "unavailable", "incomplete",
    ];
    for (const [index, stage] of stages.entries()) {
      recordActivity({
        statePath,
        root,
        advicee: advicee("session", `event-${stage}`, index === 0 ? "child-a" : null),
        lifetime,
        stage,
        findings: stage === "findings" ? 2 : 0,
        now: 100 + index,
      });
    }
    const submitted = advicee("session", "event-submitted");
    recordActivity({ statePath, root, advicee: submitted, lifetime, stage: "findings", findings: 1, now: 200 });
    recordActivity({
      statePath,
      root,
      advicee: submitted,
      lifetime,
      stage: "submitted",
      submittedFindings: 1,
      now: 201,
    });

    const status = readActivity({
      statePath,
      root,
      sessionId: "session",
      resident: { available: true, lifetime },
    });
    expect(status).toMatchObject({
      kind: "incomplete",
      observed: true,
      source: "resident-v1",
      findings: 3,
      counts: {
        skipped: 1,
        pending: 1,
        clear: 1,
        findings: 2,
        submitted: 1,
        unavailable: 1,
        incomplete: 1,
        "restarted/lost": 0,
      },
      modelReaction: {
        status: "unavailable",
        reason: "host-model-reaction-not-instrumented",
      },
      submission: { status: "submitted", findings: 1 },
    });
    expect(status.children).toHaveLength(2);
    expect(status.children.map((child) => child.identity).sort()).toEqual(["child", "root"]);
  });

  it("reports pending work as restarted/lost when its resident lifetime disappears or changes", () => {
    const statePath = makeRoot();
    const root = "/synthetic/repository";
    recordActivity({
      statePath,
      root,
      advicee: advicee("restart-session", "event"),
      lifetime: "resident-before-restart",
      stage: "pending",
    });
    expect(readActivity({
      statePath,
      root,
      sessionId: "restart-session",
      resident: { available: true, lifetime: "resident-before-restart" },
    }).kind).toBe("pending");
    expect(readActivity({
      statePath,
      root,
      sessionId: "restart-session",
      resident: { available: true, lifetime: "resident-after-restart" },
    }).kind).toBe("restarted/lost");
    expect(readActivity({
      statePath,
      root,
      sessionId: "restart-session",
      resident: { available: false },
    }).kind).toBe("restarted/lost");
  });

  it("keeps submission separate from pending work and sums unique unit findings", () => {
    const statePath = makeRoot();
    const root = "/synthetic/repository";
    const event = advicee("multi-session", "event");
    recordActivity({
      statePath,
      root,
      advicee: event,
      lifetime: "resident",
      stage: "pending",
      expectedUnitIdentities: ["unit-a", "unit-b"],
    });
    recordActivity({ statePath, root, advicee: event, lifetime: "resident", stage: "findings", findings: 2, unitIdentity: "unit-a" });
    recordActivity({ statePath, root, advicee: event, lifetime: "resident", stage: "submitted", submittedFindings: 4 });
    expect(readActivity({
      statePath,
      root,
      sessionId: "multi-session",
      resident: { available: true, lifetime: "resident" },
    })).toMatchObject({ kind: "pending", submission: { status: "submitted", findings: 4 } });

    // A retry for the same semantic unit is idempotent; the second unit adds.
    recordActivity({ statePath, root, advicee: event, lifetime: "resident", stage: "findings", findings: 2, unitIdentity: "unit-a" });
    recordActivity({ statePath, root, advicee: event, lifetime: "resident", stage: "findings", findings: 3, unitIdentity: "unit-b" });
    expect(readActivity({
      statePath,
      root,
      sessionId: "multi-session",
      resident: { available: true, lifetime: "resident" },
    })).toMatchObject({ kind: "submitted", findings: 5, submission: { findings: 4 } });
  });

  it("retains concurrent markers from separate hook processes without lost updates", async () => {
    const statePath = makeRoot();
    const root = "/synthetic/repository";
    const event = advicee("concurrent-session", "event");
    const units = Array.from({ length: 12 }, (_, index) => `unit-${index}`);
    recordActivity({
      statePath,
      root,
      advicee: event,
      lifetime: "resident",
      stage: "pending",
      expectedUnitIdentities: units,
    });
    const modulePath = resolve("src/activity/status.ts");
    await Promise.all(units.map((unitIdentity) => new Promise<void>((resolveChild, rejectChild) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", `
        import { recordActivity } from ${JSON.stringify(modulePath)};
        recordActivity(JSON.parse(process.env.ACTIVITY_INPUT));
      `], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ACTIVITY_INPUT: JSON.stringify({
            statePath,
            root,
            advicee: event,
            lifetime: "resident",
            stage: "findings",
            findings: 1,
            unitIdentity,
          }),
        },
        stdio: "ignore",
      });
      child.once("error", rejectChild);
      child.once("close", (code) => code === 0 ? resolveChild() : rejectChild(new Error(`marker child exited ${code}`)));
    })));
    expect(readActivity({
      statePath,
      root,
      sessionId: "concurrent-session",
      resident: { available: true, lifetime: "resident" },
    })).toMatchObject({ kind: "findings", findings: units.length });
  }, 10_000);

  it("bounds retained events and persists no source, paths, credentials, advice, or raw identities", () => {
    const statePath = makeRoot();
    const root = "/secret/repository/path";
    const sessionId = "raw-session-secret";
    const subagentId = "raw-child-secret";
    for (let index = 0; index < MAX_ACTIVITY_EVENTS_PER_SESSION + 8; index += 1) {
      recordActivity({
        statePath,
        root,
        advicee: advicee(sessionId, `tool-${index}`, subagentId),
        lifetime: "resident",
        stage: "clear",
        now: index,
      });
    }
    const sessionDirectories = readdirSync(statePath);
    expect(sessionDirectories).toHaveLength(1);
    const files = readdirSync(join(statePath, sessionDirectories[0]!));
    expect(files).toHaveLength(MAX_ACTIVITY_EVENTS_PER_SESSION);
    const persisted = files.map((file) => readFileSync(join(statePath, sessionDirectories[0]!, file), "utf8")).join("\n");
    for (const forbidden of [root, sessionId, subagentId, "tool-", "source", "credential", "advice", "probability"]) {
      expect(persisted).not.toContain(forbidden);
    }

    const retried = advicee(sessionId, "retry-event", subagentId);
    for (let index = 0; index < MAX_ACTIVITY_MARKERS_PER_EVENT + 8; index += 1) {
      recordActivity({
        statePath,
        root,
        advicee: retried,
        lifetime: "resident",
        stage: "findings",
        findings: 1,
        unitIdentity: `retry-unit-${index}`,
        now: MAX_ACTIVITY_EVENTS_PER_SESSION + index,
      });
    }
    expect(readdirSync(join(statePath, sessionDirectories[0]!)).length)
      .toBeLessThanOrEqual(MAX_ACTIVITY_EVENTS_PER_SESSION + MAX_ACTIVITY_MARKERS_PER_EVENT - 1);
  });
});
