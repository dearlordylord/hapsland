import { describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { join } from "node:path"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import {
  addEvent,
  makeReviewGitFixture as makeGitFixture,
  put
} from "@hapsland/build-tooling/test-support/test-fixtures"
import { acquireResidentFixture } from "../resident/runtime-fixture.ts"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import type { ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"
import { makeDispatchControls } from "@hapsland/build-tooling/test-support/dispatch-controls"

const config = () => JSON.stringify({ version: 1, reviewBackend: { provider: "openai", model: "gpt-6-luna" } })

const fixture = async () => {
  const root = await makeGitFixture()
  await put(root, "type.ts", "type Count = number\n")
  await put(root, "user.jsonc", config())
  const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
  if (observation === undefined) throw new Error("missing observation")
  const dispatch: ResidentDispatchContext = {
    statePath: join(root, "state"),
    userConfigPath: join(root, "user.jsonc"),
    controlled: null,
    credential: {
      name: "OPENAI_API_KEY",
      environmentValue: "fixture-token",

      generation: 0,
      statePath: join(root, "credential-state.json")
    }
  }
  return { root, observation, dispatch }
}

const transport = (onRequest: (url: string) => void) =>
  HttpClient.make((request) => {
    onRequest(request.url)
    const body =
      request.body._tag === "Uint8Array" ? JSON.parse(new TextDecoder().decode(request.body.body)) : undefined
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        Response.json({
          model: body.model,
          answers: body.questions.map((question: { name: string }) => ({
            type: "predicate",
            name: question.name,
            probability: 0.99
          })),
          usage: { input_tokens: 12, output_tokens: 0 }
        })
      )
    )
  })

describe("OpenAI resident dispatch", () => {
  it("routes a real resident job to the OpenAI adapter with offline HTTP", async () => {
    const { root, observation, dispatch } = await fixture()
    const urls: string[] = []
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      offlineHttpClient: transport((url) => urls.push(url))
    })
    expect((await Effect.runPromise(server.admit(observation, dispatch, true))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(urls).toEqual(["https://api.openai.com/v1/decisions"])
    expect((await Effect.runPromise(server.pendingAdviceMetadata())).length).toBeGreaterThan(0)
  })

  it("keeps the admitted destination after credential resolution", async () => {
    const { root, observation, dispatch } = await fixture()
    const controls = await Effect.runPromise(makeDispatchControls())
    await Effect.runPromise(controls.holdNext("credentialResolved"))
    const urls: string[] = []
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      offlineHttpClient: transport((url) => urls.push(url)),
      dispatchControls: controls.layer
    })
    expect((await Effect.runPromise(server.admit(observation, dispatch, true))).status).toBe("accepted")
    await Effect.runPromise(controls.entered)
    await put(root, "user.jsonc", JSON.stringify({ version: 1, reviewBackend: { provider: "jev" } }))
    await Effect.runPromise(controls.release)
    await Effect.runPromise(server.whenIdle())
    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe("https://api.openai.com/v1/decisions")
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).not.toEqual([])
  })

  it("enforces environment-only OpenAI credentials even if IPC asks for saved storage", async () => {
    const { root, observation, dispatch } = await fixture()
    if (dispatch.credential === null) throw new Error("missing fixture credential")
    const urls: string[] = []
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      offlineHttpClient: transport((url) => urls.push(url))
    })
    const missing = { ...dispatch, credential: { ...dispatch.credential, environmentValue: null } }
    expect((await Effect.runPromise(server.admit(observation, missing, true))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(urls).toEqual([])
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toEqual([])
  })
})
