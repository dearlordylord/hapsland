import { expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as TestClock from "effect/testing/TestClock"
import * as Fiber from "effect/Fiber"
import { offerJevKeyVerification, verifyJevKey, MAX_KEY_CHECKS } from "./credential-verification.ts"

it.effect.each([
  [200, "accepted"],
  [401, "rejected"],
  [403, "forbidden"],
  [429, "rate-limited"],
  [402, "unconfirmed"],
  [500, "unconfirmed"]
] as const)("checks one synthetic request and sanitizes HTTP %s", ([status, expected]) =>
  Effect.gen(function* () {
    const requests: string[] = []
    const client = HttpClient.make((request) => {
      expect(request.headers.authorization).toBe("Bearer private-key")
      expect(request.url).toBe("https://api.typesafe.ai/v1/systemone")
      const body = request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : ""
      requests.push(body)
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify(
              status === 200
                ? {
                    model: "jev-latest",
                    answers: { greeting: { type: "noul", noul: 0.8 } },
                    usage: { input_tokens: 10, output_tokens: 1 }
                  }
                : { message: "private-key and provider-private-body" }
            ),
            { status, headers: { "content-type": "application/json" } }
          )
        )
      )
    })
    const result = yield* verifyJevKey(Redacted.make("private-key"), client)
    expect(result).toBe(expected)
    expect(requests).toHaveLength(1)
    expect(JSON.parse(requests[0] ?? "").state).toBe("Hapsland connection check: hello.")
    expect(requests[0]).not.toContain("private-key")
  })
)

it.effect("bounds a hung request without retrying", () =>
  Effect.gen(function* () {
    let calls = 0
    const client = HttpClient.make(() => {
      calls++
      return Effect.never
    })
    const fiber = yield* verifyJevKey(Redacted.make("private-key"), client).pipe(Effect.forkChild)
    yield* TestClock.adjust("15 seconds")
    expect(yield* Fiber.join(fiber)).toBe("unconfirmed")
    expect(calls).toBe(1)
  })
)

it.effect("does not treat a malformed success response as a verified key", () =>
  Effect.gen(function* () {
    const client = HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response("private provider body", { status: 200, headers: { "content-type": "application/json" } })
        )
      )
    )
    expect(yield* verifyJevKey(Redacted.make("private-key"), client)).toBe("unconfirmed")
  })
)

it.effect.each(["decline", "cloudflare", "missing", "accept"] as const)("offers verification safely: %s", (scenario) =>
  Effect.gen(function* () {
    const output: string[] = []
    let prompts = 0
    let calls = 0
    yield* offerJevKeyVerification({
      provider: scenario === "cloudflare" ? "cloudflare" : "jev",
      credential:
        scenario === "missing"
          ? { status: "missing", source: "saved", generation: 0 }
          : { status: "present", source: "saved", generation: 0, value: "private-key" },
      confirm: (question) =>
        Effect.sync(() => {
          prompts++
          expect(question).toContain("paid credits")
          expect(question).toContain("no project code")
          return scenario === "accept"
        }),
      verify: (key) =>
        Effect.sync(() => {
          calls++
          expect(Redacted.value(key)).toBe("private-key")
          return "accepted" as const
        }),
      write: (text) => output.push(text)
    })
    expect(calls).toBe(scenario === "accept" ? 1 : 0)
    expect(prompts).toBe(scenario === "accept" || scenario === "decline" ? 1 : 0)
    expect(output.join("")).not.toContain("private-key")
    expect(output.join("")).toContain(scenario === "accept" ? "Key verified" : "not checked")
  })
)

it.effect.each(["rate-limited", "unconfirmed"] as const)("keeps the selected key and only warns on %s", (result) =>
  Effect.gen(function* () {
    const output: string[] = []
    let replacements = 0
    let confirmations = 0
    const credential = { status: "present" as const, source: "saved" as const, generation: 1, value: "private-key" }
    yield* offerJevKeyVerification({
      provider: "jev",
      credential,
      confirm: () =>
        Effect.sync(() => {
          confirmations++
          return true
        }),
      write: (text) => output.push(text),
      verify: () => Effect.succeed(result),
      replaceCredential: () =>
        Effect.sync(() => {
          replacements++
          return undefined
        })
    })
    expect(credential.value).toBe("private-key")
    expect(replacements).toBe(0)
    expect(confirmations).toBe(1)
    expect(output.join("")).toContain("kept for review")
    expect(output.join("")).not.toMatch(/rerun|retry|restart/i)
  })
)

it.effect.each(["saved", "file", "environment", "decline", "limit"] as const)(
  "corrects authorization rejection safely: %s",
  (scenario) =>
    Effect.gen(function* () {
      const output: string[] = []
      let calls = 0
      let replacements = 0
      let prompts = 0
      yield* offerJevKeyVerification({
        provider: "jev",
        credential: {
          status: "present",
          source: scenario === "environment" || scenario === "file" ? "environment" : "saved",
          generation: 1,
          value: "bad-key",
          ...(scenario === "file" ? { file: "/repo/.env" } : {})
        },
        confirm: () =>
          Effect.sync(() => {
            prompts++
            return prompts === 1 || scenario !== "decline"
          }),
        write: (text) => output.push(text),
        verify: (key) =>
          Effect.sync(() => {
            calls++
            return Redacted.value(key) === "good-key" ? ("accepted" as const) : ("rejected" as const)
          }),
        replaceCredential: () =>
          Effect.sync(() => {
            replacements++
            return {
              status: "present" as const,
              source: "saved" as const,
              generation: 2,
              value: scenario === "limit" ? "bad-key" : "good-key"
            }
          })
      })
      expect(calls).toBe(
        scenario === "limit" ? MAX_KEY_CHECKS : scenario === "environment" || scenario === "decline" ? 1 : 2
      )
      expect(replacements).toBe(
        scenario === "limit" ? MAX_KEY_CHECKS - 1 : scenario === "environment" || scenario === "decline" ? 0 : 1
      )
      expect(output.join("")).not.toContain("good-key")
      expect(output.join("")).not.toContain("bad-key")
    })
)
