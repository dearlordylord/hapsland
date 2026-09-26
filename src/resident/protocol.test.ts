import { describe, expect, it } from "vitest";
import { addEvent, makeGitFixture } from "../direct-event/test-fixtures.ts";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import * as Effect from "effect/Effect";
import {
  CLIENT_REQUEST_DEADLINE_MS,
  MAX_IPC_CONNECTIONS,
  MAX_IPC_FRAME_BYTES,
  STARTUP_READINESS_DEADLINE_MS,
  decodeResidentRequest,
  decodeResidentResponse,
} from "./protocol.ts";

describe("resident protocol bounds", () => {
  it("strictly decodes source-free v2 terminal statuses", () => {
    expect(decodeResidentResponse({ version: 2, status: "clear" })).toEqual({ version: 2, status: "clear" });
    expect(decodeResidentResponse({ version: 2, status: "unavailable", reason: "stale" }))
      .toEqual({ version: 2, status: "unavailable", reason: "stale" });
    expect(decodeResidentResponse({ version: 2, status: "clear", path: "source.ts" })).toBeUndefined();
    expect(decodeResidentResponse({ version: 2, status: "unavailable", reason: "other" })).toBeUndefined();
    expect(decodeResidentResponse({ version: 2, status: "empty" })).toBeUndefined();
  });
  it("accepts only the exact Claude block envelope in v2 advice", () => {
    const advice = { version: 2, status: "advice", token: "lease", findingCount: 1,
      output: { decision: "block", reason: "Repair the current finding." } };
    expect(decodeResidentResponse(advice)).toEqual(advice);
    expect(decodeResidentResponse({ ...advice, findingCount: 0 })).toBeUndefined();
    expect(decodeResidentResponse({ ...advice, findingCount: -1 })).toBeUndefined();
    expect(decodeResidentResponse({ ...advice, findingCount: 0,
      output: { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "Operational notice" } } }))
      .toBeDefined();
    expect(decodeResidentResponse({ ...advice, output: { ...advice.output, hookSpecificOutput: {} } })).toBeUndefined();
    expect(decodeResidentResponse({ ...advice, output: { decision: "block", reason: "" } })).toBeUndefined();
    expect(decodeResidentResponse({ ...advice, version: 1 })).toBeUndefined();
  });
  it("publishes the fixed lifecycle and pre-decode transport limits", () => {
    expect(STARTUP_READINESS_DEADLINE_MS).toBe(10_000);
    expect(CLIENT_REQUEST_DEADLINE_MS).toBe(1_500);
    expect(MAX_IPC_FRAME_BYTES).toBe(262_144);
    expect(MAX_IPC_CONNECTIONS).toBe(32);
  });

  it("retains child identity and rejects malformed observations after bounded framing", async () => {
    const root = await makeGitFixture();
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"], {
      agent_id: "child-7",
    })));
    expect(observation).toBeDefined();
    if (observation === undefined) return;
    const decoded = decodeResidentRequest(JSON.stringify({
      version: 1,
      operation: "admit",
      lifetime: "lifetime",
      controlledWriter: true,
      observation,
      dispatch: {
        statePath: "/tmp/consent",
        userConfigPath: null,
        credential: null,
        controlled: {},
      },
    }));
    expect(decoded?.operation).toBe("admit");
    if (decoded?.operation !== "admit") throw new Error("expected admission");
    const synthetic = { ...decoded, dispatch: { ...decoded.dispatch,
      controlled: { syntheticR6BrandedRepair: "finding" } } };
    expect(decodeResidentRequest(JSON.stringify(synthetic))?.operation).toBe("admit");
    expect(decodeResidentRequest(JSON.stringify({ ...synthetic, dispatch: {
      ...synthetic.dispatch, controlled: { syntheticR6BrandedRepair: "unknown" },
    } }))).toBeUndefined();
    if (decoded?.operation === "admit") expect(decoded.observation.advicee.subagentId).toBe("child-7");
    expect(decodeResidentRequest(JSON.stringify({
      version: 1,
      operation: "admit",
      lifetime: "lifetime",
      controlledWriter: true,
      observation: { ...observation, advicee: { ...observation.advicee, hostVersion: "0.156.0" } },
      dispatch: { statePath: "/tmp/consent", userConfigPath: null, credential: null, controlled: {} },
    }))?.operation).toBe("admit");
    expect(decodeResidentRequest(JSON.stringify({
      version: 1,
      operation: "admit",
      lifetime: "lifetime",
      controlledWriter: true,
      observation,
      dispatch: {
        statePath: "/tmp/consent",
        userConfigPath: null,
        demoBudgetPath: "/tmp/demo-budget.json",
        credential: null,
        controlled: {},
      },
    }))).toMatchObject({ operation: "admit" });
    expect(decodeResidentRequest(JSON.stringify({
      version: 1,
      operation: "admit",
      lifetime: "lifetime",
      controlledWriter: true,
      observation,
      dispatch: {
        statePath: "/tmp/consent",
        userConfigPath: null,
        demoBudgetPath: "relative-budget.json",
        credential: null,
        controlled: {},
      },
    }))).toBeUndefined();
    expect(decodeResidentRequest(JSON.stringify({
      version: 1,
      operation: "collect",
      lifetime: "lifetime",
      root,
      advicee: { ...observation.advicee, sessionId: "" },
    }))).toBeUndefined();
    const collect = {
      version: 1,
      operation: "collect",
      lifetime: "lifetime",
      root,
      advicee: observation.advicee,
      dispatch: {
        statePath: "/tmp/consent",
        userConfigPath: null,
        credential: null,
        controlled: {},
      },
    };
    expect(decodeResidentRequest(JSON.stringify({ ...collect, mode: "turn-end" })))
      .toMatchObject({ operation: "collect", mode: "turn-end" });
    expect(decodeResidentRequest(JSON.stringify({ ...collect, mode: "drain" }))).toBeUndefined();
    expect(decodeResidentRequest(JSON.stringify({
      version: 1,
      operation: "cleanup",
      lifetime: "lifetime",
    }))).toEqual({ version: 1, operation: "cleanup", lifetime: "lifetime" });
    expect(decodeResidentRequest(JSON.stringify({
      version: 1,
      operation: "shutdown",
      lifetime: "lifetime",
    }))).toBeUndefined();
  });
});
