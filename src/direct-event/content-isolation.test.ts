import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { describe, expect, it } from "@effect/vitest"
import fc from "fast-check"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Tracer from "effect/Tracer"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { InspectionTransportObservation } from "../inspection/transport.ts"
import { liveLayer } from "../jev-decision.ts"
import { providerIdentity } from "../review-providers/catalog.ts"
import { compileRule } from "../rules/compiler.ts"
import { FUNCTION_INPUT_CONTRACT, TYPE_INPUT_CONTRACT } from "../rules/targets.ts"
import { freezeRules, type PreparedUnit, type ReviewArtifact } from "./model.ts"
import { evaluatePrepared, preparedProviderInput, type EvaluationEvidence } from "./pipeline.ts"

const digest = (text: string) => createHash("sha256").update(text).digest("hex")
const fixture = (kind: "type" | "function", secret: string): PreparedUnit => {
  const artifact: ReviewArtifact = {
    path: "src/example.ts",
    id: `src/example.ts:${kind === "type" ? "type-alias" : "function"}:Example`,
    kind: kind === "type" ? "type-alias" : "function",
    name: "Example",
    source:
      kind === "type"
        ? 'export type Example = Support | "PUBLIC" | "日本語"'
        : 'export function Example() { return Support("PUBLIC") }',
    sourceHash: digest("source")
  }
  const support: ReviewArtifact = {
    path: "src/support.ts",
    id: `src/support.ts:${kind === "type" ? "type-alias" : "function"}:Support`,
    kind: kind === "type" ? "type-alias" : "function",
    name: "Support",
    source:
      kind === "type" ? "export type Support = boolean" : "export function Support(value: string) { return value }",
    sourceHash: digest("support")
  }
  Object.assign(support, { prompt: secret, transcript: secret })
  const contract = kind === "type" ? TYPE_INPUT_CONTRACT : FUNCTION_INPUT_CONTRACT
  const rule = compileRule(
    {
      version: 1,
      id: "isolation-rule",
      question: 'Check "PUBLIC" design? 🦊',
      criteria: { false: "No", true: "Yes" },
      message: `local-feedback:${secret}`,
      inputs: [
        { languages: ["typescript"], kind, requires: kind === "type" ? ["root-declaration"] : ["signature", "body"] }
      ]
    },
    `local-rule-file:${secret}`
  )
  return {
    root: `/local/${secret}`,
    identity: digest(secret),
    advicee: {
      host: "codex-cli",
      hostVersion: secret,
      sessionId: secret,
      turnId: secret,
      toolUseId: secret,
      subagentId: secret
    },
    input: {
      providerIdentity: providerIdentity({ provider: "jev" }),
      contract,
      candidateProjection: true,
      completeness: "complete",
      path: "src/example.ts",
      declaration: artifact,
      unit: {
        root: {
          artifact,
          references: [{ kind: "expanded", site: { symbol: "Support" }, node: { artifact: support, references: [] } }]
        }
      },
      rules: freezeRules([rule], {
        language: "typescript",
        artifactKind: kind === "type" ? "typeShape" : "function",
        inputContract: contract
      }),
      interpretation: "probability-strictly-greater-than-threshold"
    }
  }
}

type Wire = {
  readonly url: string
  readonly method: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}
const observe = (
  unit: PreparedUnit,
  observer?: (body: Uint8Array | undefined) => void,
  evidenceObserver?: (evidence: EvaluationEvidence) => void
) =>
  Effect.gen(function* () {
    const calls: Wire[] = []
    const http = HttpClient.make((request) => {
      if (request.body._tag !== "Uint8Array") throw new Error("expected concrete encoded request bytes")
      calls.push({
        url: request.url,
        method: request.method,
        headers: { ...request.headers },
        body: new TextDecoder().decode(request.body.body)
      })
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              model: "jev-latest",
              answers: { "isolation-rule": { type: "noul", noul: 0.25 } },
              usage: { input_tokens: 1, output_tokens: 1 }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
      )
    })
    const result = yield* evaluatePrepared(unit, Effect.void, evidenceObserver).pipe(
      Effect.provide(
        liveLayer({ apiUrl: "https://content-test.invalid/v1", credentialEnvVar: "CONTENT_TEST_KEY", httpClient: http })
      ),
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ CONTENT_TEST_KEY: "SYNTHETIC_AUTH" }))),
      Effect.provideService(InspectionTransportObservation, { observe: observer ?? (() => {}) }),
      Effect.withParentSpan(Tracer.externalSpan({ traceId: unit.advicee.sessionId, spanId: "PRIVATE_PARENT" }))
    )
    expect(result.status).toBe("evaluated")
    expect(calls).toHaveLength(1)
    return calls[0]!
  })

describe("review content isolation at the actual Jev HTTP boundary", () => {
  for (const kind of ["type", "function"] as const) {
    it.effect(`${kind}: changing private envelopes preserves exact nonempty wire contents`, () =>
      Effect.gen(function* () {
        const baseline = yield* observe(fixture(kind, "baseline-private"))
        for (const secret of [
          "prompt-never-send",
          "transcript-never-send",
          "inspection-never-send",
          'quote-"-日本語-🦊',
          ...fc.sample(
            fc.string({ maxLength: 128 }).map((text) => `PRIVATE_${text}`),
            { seed: 20261006, numRuns: 32 }
          )
        ]) {
          const unit = fixture(kind, secret)
          // Native JSON may have extra fields despite TypeScript's structural type.
          // Put private inputs on the actual object; absence-only sentinels prove nothing.
          Object.assign(unit, {
            prompt: secret,
            transcript: [secret],
            inspection: { text: secret },
            promptDigest: digest(secret)
          })
          Object.assign(unit.input, {
            conversation: [secret],
            transcript_path: `/private/${secret}`,
            promptDigest: digest(secret)
          })
          Object.assign(unit.input.unit.root, { prompt: secret, transcript: [secret] })
          Object.assign(unit.input.unit.root.artifact, { prompt: secret, transcript: [secret] })
          const wire = yield* observe(unit)
          expect(wire).toEqual(baseline)
          expect(JSON.stringify(wire)).not.toContain(secret)
          expect(JSON.stringify(wire)).not.toContain(digest(secret))
        }
        const body = JSON.parse(baseline.body)
        expect(body).toEqual({
          model: "jev-latest",
          state: preparedProviderInput(fixture(kind, "another-private")),
          questions: {
            "isolation-rule": {
              type: "noul",
              instructions: 'Check "PUBLIC" design? 🦊',
              criteria: { false: "No", true: "Yes" }
            }
          }
        })
        expect(body.state.artifact.source).toContain("PUBLIC")
        expect(body.state.evidence.nodes).toHaveLength(1)
        expect(body.state.evidence.nodes[0].domain).toBe("src/support.ts")
        expect(baseline.url).toBe("https://content-test.invalid/v1/systemone")
        expect(baseline.method).toBe("POST")
        expect(Object.keys(baseline.headers).sort()).toEqual([
          "accept",
          "authorization",
          "content-length",
          "content-type"
        ])
        expect(baseline.headers.authorization).toBe("Bearer SYNTHETIC_AUTH")
      })
    )
  }

  it.effect("inspection cannot replace source bytes with local conversation text", () =>
    Effect.gen(function* () {
      const baseline = yield* observe(fixture("type", "private"))
      let invoked = false
      const wire = yield* observe(fixture("type", "private"), (bytes) => {
        if (bytes === undefined) throw new Error("missing inspection body")
        invoked = true
        const modified = new TextEncoder().encode(new TextDecoder().decode(bytes).replaceAll("PUBLIC", "SECRET"))
        bytes.set(modified)
      })
      expect(invoked).toBe(true)
      expect(wire).toEqual(baseline)
      expect(wire.body).not.toContain("SECRET")
    })
  )

  it.effect("model-input observers cannot rewrite selected code before provider encoding", () =>
    Effect.gen(function* () {
      const baseline = yield* observe(fixture("type", "private"))
      let attempted = false
      const wire = yield* observe(fixture("type", "private"), undefined, (evidence) => {
        if (evidence.kind !== "model-input") return
        const visit = (value: unknown): void => {
          if (value === null || typeof value !== "object") return
          if (Object.hasOwn(value, "source")) {
            attempted = true
            Reflect.set(value, "source", "PRIVATE_CONVERSATION")
          }
          for (const child of Object.values(value)) visit(child)
        }
        visit(evidence.input)
      })
      expect(attempted).toBe(true)
      expect(wire).toEqual(baseline)
    })
  )

  it("preserves the selected request through FetchHttpClient and an actual loopback socket", async () => {
    const received: Array<{ body: string; headers: Readonly<Record<string, unknown>>; url: string | undefined }> = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on("data", (chunk: Buffer) => chunks.push(chunk))
      request.on("end", () => {
        received.push({
          body: Buffer.concat(chunks).toString("utf8"),
          headers: { ...request.headers },
          url: request.url
        })
        response.writeHead(200, { "content-type": "application/json" })
        response.end(
          JSON.stringify({
            model: "jev-latest",
            answers: { "isolation-rule": { type: "noul", noul: 0.25 } },
            usage: { input_tokens: 1, output_tokens: 1 }
          })
        )
      })
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolve)
      })
      const address = server.address()
      if (address === null || typeof address === "string") throw new Error("missing loopback port")
      const unit = fixture("function", "PRIVATE_CONVERSATION")
      let inspectionRan = false
      const result = await Effect.runPromise(
        evaluatePrepared(unit).pipe(
          Effect.provide(
            liveLayer({ apiUrl: `http://127.0.0.1:${address.port}/v1`, credentialEnvVar: "CONTENT_TEST_KEY" })
          ),
          Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ CONTENT_TEST_KEY: "SYNTHETIC_AUTH" }))),
          Effect.provideService(InspectionTransportObservation, {
            observe: (bytes) => {
              if (bytes === undefined) throw new Error("missing request bytes")
              inspectionRan = true
              bytes.set(new TextEncoder().encode(new TextDecoder().decode(bytes).replaceAll("PUBLIC", "SECRET")))
            }
          }),
          Effect.withParentSpan(Tracer.externalSpan({ traceId: "PRIVATE_CONVERSATION", spanId: "PRIVATE_PARENT" })),
          Effect.timeout("2 seconds")
        )
      )
      expect(result.status).toBe("evaluated")
      expect(inspectionRan).toBe(true)
      expect(received).toHaveLength(1)
      const wire = received[0]!
      expect(wire.url).toBe("/v1/systemone")
      expect(JSON.parse(wire.body).state).toEqual(preparedProviderInput(unit))
      expect(wire.headers.authorization).toBe("Bearer SYNTHETIC_AUTH")
      expect(wire.headers["content-length"]).toBe(String(Buffer.byteLength(wire.body)))
      expect(wire.headers.traceparent).toBeUndefined()
      expect(wire.headers.b3).toBeUndefined()
      expect(JSON.stringify(wire)).not.toContain("PRIVATE_CONVERSATION")
      expect(JSON.stringify(wire)).not.toContain("PRIVATE_PARENT")
      expect(wire.body).not.toContain("SECRET")
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    }
  })
})
