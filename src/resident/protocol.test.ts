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
} from "./protocol.ts";

describe("resident protocol bounds", () => {
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
    if (decoded?.operation === "admit") expect(decoded.observation.recipient.agentId).toBe("child-7");
    expect(decodeResidentRequest(JSON.stringify({
      version: 1,
      operation: "collect",
      lifetime: "lifetime",
      root,
      recipient: { ...observation.recipient, sessionId: "" },
    }))).toBeUndefined();
    const collect = {
      version: 1,
      operation: "collect",
      lifetime: "lifetime",
      root,
      recipient: observation.recipient,
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
