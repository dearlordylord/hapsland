import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { join } from "node:path";
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts";
import { addEvent, makeGitFixture, put } from "../direct-event/test-fixtures.ts";
import { acquireResidentFixture } from "../resident/runtime-fixture.ts";
import { residentPaths } from "../resident/paths.ts";
import type { ResidentDispatchContext } from "../resident/protocol.ts";
import { makeDispatchControls } from "../test-support/dispatch-controls.ts";

const config = (model = "clef") => JSON.stringify({ version: 1,
  reviewBackend: { provider: "cloudflare", model, accountId: "a".repeat(32) } });

const fixture = async () => {
  const root = await makeGitFixture();
  await put(root, "type.ts", "type Count = number\n");
  await put(root, "user.jsonc", config());
  const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)));
  if (observation === undefined) throw new Error("missing observation");
  const dispatch: ResidentDispatchContext = {
    statePath: join(root, "state"), userConfigPath: join(root, "user.jsonc"), controlled: null,
    credential: { name: "CLOUDFLARE_API_TOKEN", environmentValue: "fixture-token", environmentOnly: true,
      generation: 0, statePath: join(root, "credential-state.json") },
  };
  return { root, observation, dispatch };
};

const transport = (onRequest: (url: string) => void) => HttpClient.make((request) => {
  onRequest(request.url);
  const body = request.body._tag === "Uint8Array" ? JSON.parse(new TextDecoder().decode(request.body.body)) : undefined;
  return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ success: true, errors: [],
    result: { model: body.model, answers: Object.fromEntries(Object.keys(body.questions).map((id) =>
      [id, { type: "noul", noul: 0.99 }])) } })));
});

describe("Cloudflare resident dispatch", () => {
  it("routes a real resident job to the Cloudflare adapter with offline HTTP", async () => {
    const { root, observation, dispatch } = await fixture();
    const urls: string[] = [];
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined,
      { offlineHttpClient: transport((url) => urls.push(url)) });
    expect(Effect.runSync(server.admit(observation, dispatch, true)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    expect(urls).toEqual([`https://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/ai/run/@cf/cloudflare/clef`]);
    expect((await Effect.runPromise(server.pendingAdviceMetadata())).length).toBeGreaterThan(0);
  });

  it("refuses destination changes after credential resolution", async () => {
    const { root, observation, dispatch } = await fixture();
    const controls = await Effect.runPromise(makeDispatchControls());
    await Effect.runPromise(controls.holdNext("credentialResolved"));
    const urls: string[] = [];
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined,
      { offlineHttpClient: transport((url) => urls.push(url)), dispatchControls: controls.layer });
    expect(Effect.runSync(server.admit(observation, dispatch, true)).status).toBe("accepted");
    await Effect.runPromise(controls.entered);
    await put(root, "user.jsonc", config("clef-flash"));
    await Effect.runPromise(controls.release);
    await Effect.runPromise(server.whenIdle());
    expect(urls).toEqual([]);
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toEqual([]);
  });

  it("enforces environment-only Cloudflare credentials even if IPC asks for saved storage", async () => {
    const { root, observation, dispatch } = await fixture();
    if (dispatch.credential === null) throw new Error("missing fixture credential");
    const urls: string[] = [];
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined,
      { offlineHttpClient: transport((url) => urls.push(url)) });
    const missing = { ...dispatch, credential: { ...dispatch.credential, environmentValue: null, environmentOnly: false } };
    expect(Effect.runSync(server.admit(observation, missing, true)).status).toBe("accepted");
    await Effect.runPromise(server.whenIdle());
    expect(urls).toEqual([]);
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toEqual([]);
  });
});
