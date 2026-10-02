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
  it("uses one version-one envelope for bounded edit responses and rejects retired ticket requests", () => {
    const observation = { root: "/tmp/repository", rootIdentity: {
      rootDevice: "1", rootInode: "2", gitDirectory: "/tmp/repository/.git", gitDevice: "1", gitInode: "3",
    }, advicee: { host: "claude-code", hostVersion: "2.1.218", sessionId: "session", turnId: null,
      subagentId: null, toolUseId: "tool" }, candidates: [{ operation: "add", path: "type.ts" }] } as const;
    const request = { requestRoute: "edit", operation: "admit-and-collect", composed: true,
      lifetime: "owner", observation, controlledWriter: true,
      dispatch: { statePath: "/tmp/consent", userConfigPath: null, credential: null, controlled: {} }, waitMs: 1_000 } as const;
    const lifecycle = { requestRoute: "shared", operation: "hello" } as const;
    expect(CURRENT_IPC_VERSION).toBe(1);
    const wire = JSON.parse(encodeCurrentResidentRequest(request));
    expect(wire).toMatchObject({ version: 1, operation: "admit-and-collect", waitMs: 1_000 });
    expect(wire).not.toHaveProperty("requestRoute");
    expect(wire).not.toHaveProperty("ticket");
    expect(decodeCurrentResidentRequest(JSON.stringify(wire))).toEqual(request);
    expect(decodeCurrentResidentRequest(encodeCurrentResidentRequest(lifecycle))).toEqual(lifecycle);
    for (const waitMs of [-1, 3_901, 1.5, null]) {
      expect(decodeCurrentResidentRequest(JSON.stringify({ ...wire, waitMs }))).toBeUndefined();
    }
    for (const change of [{ composed: false }, { composed: undefined }, { version: 2 },
      { requestRoute: "edit" }, { ticketed: true }, { ticket: { nonce: "old", lifetime: "owner" } },
      { observation: { ...observation, advicee: { ...observation.advicee, host: "opencode" } } }]) {
      expect(decodeCurrentResidentRequest(JSON.stringify({ ...wire, ...change }))).toBeUndefined();
    }
    expect(decodeCurrentResidentRequest(JSON.stringify({ ...wire, operation: "admit", ticketed: true }))).toBeUndefined();
    expect(decodeCurrentResidentResponse(JSON.parse(encodeCurrentResidentResponse({ requestRoute: "edit", status: "empty" })), request))
      .toEqual({ requestRoute: "edit", status: "empty" });
    expect(decodeCurrentResidentResponse({ status: "empty" }, request)).toBeUndefined();
    expect(decodeCurrentResidentResponse({ version: 1, status: "accepted", ticket: { nonce: "old", lifetime: "owner" } }, request)).toBeUndefined();
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

  it("strictly decodes Claude collection responses without aggregate terminal statuses", () => {
    expect(decodeResidentResponse({ requestRoute: "edit", status: "empty" })).toEqual({ requestRoute: "edit", status: "empty" });
    expect(decodeResidentResponse({ requestRoute: "edit", status: "unavailable", reason: "stale" }))
      .toEqual({ requestRoute: "edit", status: "unavailable", reason: "stale" });
    expect(decodeResidentResponse({ requestRoute: "edit", status: "clear" })).toBeUndefined();
    expect(decodeResidentResponse({ requestRoute: "edit", status: "empty", path: "source.ts" })).toBeUndefined();
    expect(decodeResidentResponse({ requestRoute: "edit", status: "unavailable", reason: "other" })).toBeUndefined();
    expect(decodeResidentResponse({ requestRoute: "edit", status: "no-work" })).toBeUndefined();
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
  it("accepts only the exact Claude block envelope in edit advice", () => {
    const advice = { requestRoute: "edit", status: "advice", token: "lease", findingCount: 1,
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
      operation: "admit", composed: true,
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
    for (const requestRoute of ["shared"]) {
      const admission = { ...decoded, requestRoute, observation: { ...decoded.observation,
        advicee: { ...decoded.observation.advicee, host: "claude-code", hostVersion: "2.1.218", turnId: null } } };
      expect(decodeResidentRequest(JSON.stringify(admission))).toBeDefined();
      for (const composed of [undefined, false, "true"]) {
        expect(decodeResidentRequest(JSON.stringify({ ...admission, composed }))).toBeUndefined();
      }
    }
    const synthetic = { ...decoded, dispatch: { ...decoded.dispatch,
      controlled: { syntheticR6BrandedRepair: "finding" } } };
    expect(decodeResidentRequest(JSON.stringify(synthetic))?.operation).toBe("admit");
    expect(decodeResidentRequest(JSON.stringify({ ...synthetic, dispatch: {
      ...synthetic.dispatch, controlled: { syntheticR6BrandedRepair: "unknown" },
    } }))).toBeUndefined();
    if (decoded?.operation === "admit") expect(decoded.observation.advicee.subagentId).toBe("child-7");
    expect(decodeResidentRequest(JSON.stringify({
      requestRoute: "shared",
      operation: "admit", composed: true,
      lifetime: "lifetime",
      controlledWriter: true,
      observation: { ...observation, advicee: { ...observation.advicee, hostVersion: "0.156.0" } },
      dispatch: { statePath: "/tmp/consent", userConfigPath: null, credential: null, controlled: {} },
    }))?.operation).toBe("admit");
    expect(decodeResidentRequest(JSON.stringify({
      requestRoute: "shared",
      operation: "admit", composed: true,
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
      operation: "admit", composed: true,
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
      operation: "collect", composed: true,
      lifetime: "lifetime",
      root,
      advicee: { ...observation.advicee, sessionId: "" },
    }))).toBeUndefined();
    const collect = {
      requestRoute: "shared",
      operation: "collect", composed: true,
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
    expect(decodeResidentRequest(JSON.stringify({ ...collect, mode: "turn-end" }))).toBeUndefined();
    expect(decodeResidentRequest(JSON.stringify({ ...collect, mode: "turn-end",
      finish: { token: "stop", deadlineReached: false } }))).toMatchObject({ operation: "collect", mode: "turn-end" });
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
