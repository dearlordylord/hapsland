import { describe, expect, it } from "vitest";
import { addEvent, makeGitFixture, advicee } from "../direct-event/test-fixtures.ts";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import * as Effect from "effect/Effect";
import {
  CLIENT_REQUEST_DEADLINE_MS,
  MAX_IPC_CONNECTIONS,
  MAX_IPC_FRAME_BYTES,
  STARTUP_READINESS_DEADLINE_MS,
  CURRENT_IPC_VERSION,
  encodeCurrentResidentRequest,
  decodeCurrentResidentRequest,
  encodeCurrentResidentResponse,
  decodeCurrentResidentResponse,
  decodeResidentRequest,
  decodeResidentResponse,
} from "./protocol.ts";

describe("resident protocol bounds", () => {
  it("uses one current wire version for ticketed admission and lifecycle collection", () => {
    const ticketed = { requestRoute: "ticketed", operation: "collect", lifetime: "owner",
      ticket: { nonce: "nonce", lifetime: "owner" }, root: "/tmp/repository",
      advicee: { ...advicee(), host: "claude-code" as const, hostVersion: "2.1.218", turnId: null },
      dispatch: { statePath: "/tmp/consent", userConfigPath: null, credential: null, controlled: {} } } as const;
    const lifecycle = { requestRoute: "shared", operation: "hello" } as const;
    expect(CURRENT_IPC_VERSION).toBe(3);
    expect(JSON.parse(encodeCurrentResidentRequest(ticketed))).toMatchObject({ version: 3, operation: "collect" });
    expect(JSON.parse(encodeCurrentResidentRequest(ticketed))).not.toHaveProperty("requestRoute");
    expect(decodeCurrentResidentRequest(encodeCurrentResidentRequest(ticketed))).toEqual(ticketed);
    expect(decodeCurrentResidentRequest(encodeCurrentResidentRequest(lifecycle))).toEqual(lifecycle);
    expect(decodeCurrentResidentRequest(JSON.stringify(ticketed))).toBeUndefined();
    expect(decodeCurrentResidentRequest(JSON.stringify(lifecycle))).toBeUndefined();
    expect(decodeCurrentResidentRequest(JSON.stringify({ ...JSON.parse(encodeCurrentResidentRequest(ticketed)),
      requestRoute: "shared" }))).toBeUndefined();
    expect(decodeCurrentResidentResponse(JSON.parse(encodeCurrentResidentResponse({ requestRoute: "ticketed", status: "empty" })), ticketed))
      .toEqual({ requestRoute: "ticketed", status: "empty" });
    expect(decodeCurrentResidentResponse(JSON.parse(encodeCurrentResidentResponse({ status: "ready", lifetime: "owner", pid: 12 })), lifecycle))
      .toEqual({ status: "ready", lifetime: "owner", pid: 12 });
    expect(decodeCurrentResidentResponse({ version: 2, status: "empty" }, ticketed)).toBeUndefined();
    expect(decodeCurrentResidentResponse({ version: 3, requestRoute: "ticketed", status: "empty" }, ticketed)).toBeUndefined();
    expect(decodeCurrentResidentResponse({ status: "ready", lifetime: "owner", pid: 12 }, lifecycle)).toBeUndefined();
  });
  it("accepts finish decisions only on composed turn-end collection with an attempt and deadline signal", () => {
    const request = { requestRoute: "shared", operation: "collect", lifetime: "lifetime", root: "/tmp/repository",
      advicee: advicee(), dispatch: { statePath: "/tmp/consent", userConfigPath: null, credential: null, controlled: {} },
      composed: true, mode: "turn-end", finish: { token: "attempt", deadlineReached: false } };
    expect(decodeResidentRequest(JSON.stringify(request))).toEqual(request);
    for (const change of [{ composed: undefined }, { mode: "ordinary" },
      { finish: { token: "attempt" } }, { finish: { token: "", deadlineReached: true } }]) {
      expect(decodeResidentRequest(JSON.stringify({ ...request, ...change }))).toBeUndefined();
    }
  });

  it("strictly decodes Claude collection responses without ticket-wide terminal statuses", () => {
    expect(decodeResidentResponse({ requestRoute: "ticketed", status: "empty" })).toEqual({ requestRoute: "ticketed", status: "empty" });
    expect(decodeResidentResponse({ requestRoute: "ticketed", status: "unavailable", reason: "stale" }))
      .toEqual({ requestRoute: "ticketed", status: "unavailable", reason: "stale" });
    expect(decodeResidentResponse({ requestRoute: "ticketed", status: "clear" })).toBeUndefined();
    expect(decodeResidentResponse({ requestRoute: "ticketed", status: "empty", path: "source.ts" })).toBeUndefined();
    expect(decodeResidentResponse({ requestRoute: "ticketed", status: "unavailable", reason: "other" })).toBeUndefined();
    expect(decodeResidentResponse({ requestRoute: "ticketed", status: "no-work" })).toBeUndefined();
  });
  it("decodes the opt-in advicee work state without changing ordinary collection", () => {
    expect(decodeResidentResponse({ status: "pending" })).toEqual({ status: "pending" });
    expect(decodeResidentResponse({ status: "pending", path: "source.ts" })).toBeUndefined();
  });
  it("strictly decodes bounded background waiter ownership", () => {
    const request = { requestRoute: "shared", operation: "claim-background", lifetime: "lifetime",
      root: "/tmp/repository", advicee: advicee(),
      token: "00000000-0000-4000-8000-000000000001" };
    expect(decodeResidentRequest(JSON.stringify(request))).toEqual(request);
    expect(decodeResidentRequest(JSON.stringify({ ...request, operation: "release-background" })))
      .toEqual({ ...request, operation: "release-background" });
    expect(decodeResidentRequest(JSON.stringify({ ...request, token: "bad" }))).toBeUndefined();
    expect(decodeResidentResponse({ status: "background-claimed" })).toEqual({ status: "background-claimed" });
  });
  it("accepts only the exact Claude block envelope in ticket advice", () => {
    const advice = { requestRoute: "ticketed", status: "advice", token: "lease", findingCount: 1,
      output: { decision: "block", reason: "Repair the current finding." } };
    expect(decodeResidentResponse(advice)).toEqual(advice);
    expect(decodeResidentResponse({ ...advice, findingCount: 0 })).toBeUndefined();
    expect(decodeResidentResponse({ ...advice, findingCount: -1 })).toBeUndefined();
    expect(decodeResidentResponse({ ...advice, findingCount: 0,
      output: { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "Operational notice" } } }))
      .toBeDefined();
    expect(decodeResidentResponse({ ...advice, output: { ...advice.output, hookSpecificOutput: {} } })).toBeUndefined();
    expect(decodeResidentResponse({ ...advice, output: { decision: "block", reason: "" } })).toBeUndefined();
    expect(decodeResidentResponse({ ...advice, requestRoute: "shared" })).toBeUndefined();
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
      requestRoute: "shared",
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
      requestRoute: "shared",
      operation: "admit",
      lifetime: "lifetime",
      controlledWriter: true,
      observation: { ...observation, advicee: { ...observation.advicee, hostVersion: "0.156.0" } },
      dispatch: { statePath: "/tmp/consent", userConfigPath: null, credential: null, controlled: {} },
    }))?.operation).toBe("admit");
    expect(decodeResidentRequest(JSON.stringify({
      requestRoute: "shared",
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
      requestRoute: "shared",
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
      requestRoute: "shared",
      operation: "collect",
      lifetime: "lifetime",
      root,
      advicee: { ...observation.advicee, sessionId: "" },
    }))).toBeUndefined();
    const collect = {
      requestRoute: "shared",
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
    expect(decodeResidentRequest(JSON.stringify({ ...collect, reportWorkState: true })))
      .toMatchObject({ operation: "collect", reportWorkState: true });
    expect(decodeResidentRequest(JSON.stringify({ ...collect, reportWorkState: false }))).toBeUndefined();
    expect(decodeResidentRequest(JSON.stringify({ ...collect, mode: "drain" }))).toBeUndefined();
    expect(decodeResidentRequest(JSON.stringify({
      requestRoute: "shared",
      operation: "cleanup",
      lifetime: "lifetime",
    }))).toEqual({ requestRoute: "shared", operation: "cleanup", lifetime: "lifetime" });
    expect(decodeResidentRequest(JSON.stringify({
      requestRoute: "shared",
      operation: "shutdown",
      lifetime: "lifetime",
    }))).toBeUndefined();
  });
});
