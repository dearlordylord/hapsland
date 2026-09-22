import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DirectRecipient } from "../direct-event/model.ts";
import {
  MAX_ACTIVITY_EVENTS_PER_SESSION,
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
const recipient = (sessionId: string, toolUseId: string, agentId: string | null = null): DirectRecipient => ({
  host: "codex-cli",
  hostVersion: "0.155.1",
  sessionId,
  turnId: `turn-${toolUseId}`,
  toolUseId,
  agentId,
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
        recipient: recipient("session", `event-${stage}`, index === 0 ? "child-a" : null),
        lifetime,
        stage,
        findings: stage === "findings" ? 2 : 0,
        now: 100 + index,
      });
    }
    const submitted = recipient("session", "event-submitted");
    recordActivity({ statePath, root, recipient: submitted, lifetime, stage: "findings", findings: 1, now: 200 });
    recordActivity({
      statePath,
      root,
      recipient: submitted,
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
        findings: 1,
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
      recipient: recipient("restart-session", "event"),
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

  it("bounds retained events and persists no source, paths, credentials, advice, or raw identities", () => {
    const statePath = makeRoot();
    const root = "/secret/repository/path";
    const sessionId = "raw-session-secret";
    const agentId = "raw-child-secret";
    for (let index = 0; index < MAX_ACTIVITY_EVENTS_PER_SESSION + 8; index += 1) {
      recordActivity({
        statePath,
        root,
        recipient: recipient(sessionId, `tool-${index}`, agentId),
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
    for (const forbidden of [root, sessionId, agentId, "tool-", "source", "credential", "advice", "probability"]) {
      expect(persisted).not.toContain(forbidden);
    }
  });
});
