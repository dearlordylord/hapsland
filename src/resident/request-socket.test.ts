import { expect, it } from "vitest";
import { Effect } from "effect";
import { createConnection } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewControlsLayer } from "../test-support/review-controls.ts";
import { acquireResidentFixture } from "./runtime-fixture.ts";
import { residentPaths } from "./paths.ts";
import { encodeCurrentResidentRequest, MAX_IPC_FRAME_BYTES } from "./protocol.ts";
import { requestConformanceCases } from "../test-support/resident-request-conformance.ts";

const exchange = (path: string, frame: string) => new Promise<unknown>((resolve, reject) => {
  const socket = createConnection(path);
  let response = "";
  socket.on("error", reject);
  socket.on("data", (chunk: Buffer) => { response += chunk.toString("utf8"); });
  socket.on("close", () => {
    try { resolve(JSON.parse(response)); } catch (error) { reject(error); }
  });
  socket.on("connect", () => socket.write(`${frame}\n`));
});

it("dispatches every valid v1 alternative over real sockets and rejects malformed inputs before handlers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hapsland-request-schema-"));
  const paths = residentPaths(directory);
  let handlerHandoffs = 0;
  const server = await acquireResidentFixture(paths, undefined, { reviewControls: reviewControlsLayer({
    beforeResponseHandoff: Effect.fn("RequestSocketTest.handlerHandoff")(() => Effect.sync(() => { handlerHandoffs += 1; })),
  }) });
  try {
    await Effect.runPromise(server.listen());
    for (const request of requestConformanceCases) {
      const before = handlerHandoffs;
      const response = await exchange(paths.socket, encodeCurrentResidentRequest(request));
      expect(response).toMatchObject({ version: 1, status: request.operation === "hello" ? "ready" : request.requestRoute === "edit" ? "unavailable" : "obsolete-lifetime" });
      expect(handlerHandoffs, request.operation).toBe(before + 1);
      const wire = JSON.parse(encodeCurrentResidentRequest(request));
      for (const field of ["unknown", "ticket", "ticketed", "requestRoute"]) {
        expect(await exchange(paths.socket, JSON.stringify({ ...wire, [field]: true })))
          .toEqual({ version: 1, status: "unsupported" });
        expect(handlerHandoffs).toBe(before + 1);
      }
      for (const field of Object.keys(wire)) {
        // Optional fields are already covered by schema conformance; required
        // operation/lifetime/version fences are exercised on native sockets.
        if (!["operation", "lifetime", "version"].includes(field)) continue;
        const invalid = { ...wire };
        Reflect.deleteProperty(invalid, field);
        expect(await exchange(paths.socket, JSON.stringify(invalid))).toEqual({ version: 1, status: "unsupported" });
        expect(handlerHandoffs).toBe(before + 1);
      }
    }
    const before = handlerHandoffs;
    const admission = requestConformanceCases.find(request => request.operation === "admit");
    if (admission?.operation !== "admit") throw new Error("missing admission fixture");
    const wire = JSON.parse(encodeCurrentResidentRequest(admission));
    for (const change of [
      { observation: { ...wire.observation, candidates: [] } },
      { observation: { ...wire.observation, advicee: { ...wire.observation.advicee, extra: true } } },
      { dispatch: { ...wire.dispatch, statePath: "relative" } },
      { dispatch: { ...wire.dispatch, controlled: { delayMs: -1 } } },
      { dispatch: { ...wire.dispatch, credential: { name: "API_KEY", environmentValue: null,
        environmentOnly: true, generation: -1, statePath: "/tmp/state" } } },
    ]) {
      expect(await exchange(paths.socket, JSON.stringify({ ...wire, ...change })))
        .toEqual({ version: 1, status: "unsupported" });
      expect(handlerHandoffs).toBe(before);
    }
    for (const frame of ["not-json", "null", "[]", '{"version":2,"operation":"hello"}',
      '{"version":1,"operation":"shutdown","lifetime":"old"}',
      '{"version":1,"operation":"collect","lifetime":"old"}']) {
      expect(await exchange(paths.socket, frame)).toEqual({ version: 1, status: "unsupported" });
    }
    expect(await exchange(paths.socket, "x".repeat(MAX_IPC_FRAME_BYTES + 1)))
      .toEqual({ version: 1, status: "rejected-capacity" });
    expect(handlerHandoffs).toBe(before);
    expect(Effect.runSync(server.stats())).toMatchObject({ queued: 0, running: 0, pendingAdvice: 0 });
  } finally {
    await Effect.runPromise(server.close);
    await rm(directory, { recursive: true, force: true });
  }
});
