/** Offline #138 candidate egress measurement from verified T-case patches and current pipeline. */
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { DEFAULT_API_BASE, DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts"
import { compileRulePack } from "../rules/compiler.ts"
import { BUNDLED_NOUL_PACK } from "../rules/bundled.ts"
import { TYPE_INPUT_CONTRACT } from "../rules/targets.ts"
import { adaptCodexDirectEvent } from "./adapter.ts"
import { encodedFullJevRequestBytes, evaluatePrepared, prepareObservation, preparedProviderInput } from "./pipeline.ts"
import { addEvent, makeGitFixture, put } from "./test-fixtures.ts"

type Source = { readonly path: string; readonly sha256: string; readonly bytes: number }
type Fixture = {
  readonly id: string
  readonly branch: string
  readonly event: { readonly patch: string }
  readonly selectedRoot: { readonly name: string }
  readonly sources: ReadonlyArray<Source>
}
type CandidateSource = {
  readonly role: string
  readonly path: string
  readonly fixturePath: string
  readonly sha256: string
  readonly bytes: number
}
type CandidateRecord = {
  readonly status: string
  readonly inputContract: string
  readonly sourceFields: ReadonlyArray<CandidateSource>
  readonly sourceFieldUtf8Bytes: number
  readonly localRequestBytes: number
  readonly httpBodyBytes: number
  readonly httpBodySha256: string
}

const corpus = new URL("../../evidence/issue-138-adoption/", import.meta.url)
const readJson = async <T>(name: string): Promise<T> => JSON.parse(await readFile(new URL(name, corpus), "utf8")) as T
const hash = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex")
const bytes = (value: string): number => Buffer.byteLength(value, "utf8")
const sentinel = "OFFLINE_CANDIDATE_EGRESS_SENTINEL"

describe("T-case candidate HTTP body and source scope", () => {
  it("matches all 12 source-backed candidate rows through the pinned injected client", async () => {
    const manifest = await readJson<{ readonly cases: ReadonlyArray<Fixture> }>("manifest.json")
    const rule = BUNDLED_NOUL_PACK.rules.find((item) => item.id === "r2_meaningless_combinations")
    if (rule === undefined) throw new Error("missing built-in probe rule")
    const pack = { schemaVersion: 1, id: "noul-type", contentVersion: "1", rules: [rule] }
    const rules = compileRulePack(pack, "proposal:issue-138-candidate-egress")
    const measured: Array<{ readonly id: string; readonly candidate: CandidateRecord }> = []
    for (const fixture of manifest.cases.filter((item) => item.branch.split("/")[0] === "type-shape")) {
      const root = await makeGitFixture()
      const sourceByPath = new Map<string, { source: Source; text: string }>()
      for (const source of fixture.sources) {
        const data = await readFile(new URL(source.path, corpus))
        expect(data.byteLength).toBe(source.bytes)
        expect(hash(data)).toBe(source.sha256)
        const name = source.path.split("/").at(-1)
        if (name === undefined || name === "root.before.ts") continue
        const text = data.toString("utf8")
        expect(Buffer.from(text).equals(data)).toBe(true)
        sourceByPath.set(name, { source, text })
        await put(root, name, text)
      }
      const observation = await Effect.runPromise(
        adaptCodexDirectEvent(
          addEvent(root, ["root.ts"], {
            tool_input: { command: fixture.event.patch },
            tool_response: { success: true }
          })
        )
      )
      expect(observation).toBeDefined()
      if (observation === undefined) throw new Error(`${fixture.id}: no adapted event`)
      const prepared = await Effect.runPromise(
        prepareObservation(observation, {
          controlledWriter: true,
          advicee: observation.advicee,
          inputContract: TYPE_INPUT_CONTRACT,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
          rules
        })
      )
      const ready = prepared.outcomes.filter((item) => item.status === "ready")
      expect(ready).toHaveLength(1)
      const item = ready[0]
      if (item?.status !== "ready") throw new Error(`${fixture.id}: no complete candidate unit`)
      expect(item.prepared.input.declaration.name).toBe(fixture.selectedRoot.name)
      const input = preparedProviderInput(item.prepared)
      expect(input).toBeDefined()
      if (input === undefined || !("nodes" in input.evidence)) throw new Error(`${fixture.id}: no candidate input`)
      const sourceFields: CandidateSource[] = []
      for (const [index, part] of [input.artifact, ...input.evidence.nodes].entries()) {
        const path = part.domain
        const source = sourceByPath.get(path)
        expect(source).toBeDefined()
        if (source === undefined) throw new Error(`${fixture.id}: source escaped fixture: ${path}`)
        expect(source.text).toContain(part.source)
        sourceFields.push({
          role: index === 0 ? "root" : `node:${index - 1}`,
          path,
          fixturePath: source.source.path,
          sha256: hash(part.source),
          bytes: bytes(part.source)
        })
      }
      const localRequestBytes = encodedFullJevRequestBytes(item.prepared)
      let body: string | undefined
      const http = HttpClient.make((request) => {
        expect(request.url).toBe(DEFAULT_DESTINATION)
        expect(request.method).toBe("POST")
        expect(request.headers.authorization).toBe(`Bearer ${sentinel}`)
        expect(request.body._tag).toBe("Uint8Array")
        if (request.body._tag !== "Uint8Array") throw new Error("expected encoded body")
        body = new TextDecoder().decode(request.body.body)
        expect(request.headers["content-length"]).toBe(String(bytes(body)))
        const answers = Object.fromEntries(
          item.prepared.input.rules.map((rule) => [rule.id, { type: "noul", noul: 0.25 }])
        )
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(
              JSON.stringify({ model: "jev-latest", answers, usage: { input_tokens: 1, output_tokens: 1 } }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        )
      })
      const client = TypeSafeClient.layer({ apiUrl: DEFAULT_API_BASE, apiKey: Redacted.make(sentinel) }).pipe(
        Layer.provide(Layer.succeed(HttpClient.HttpClient, http))
      )
      const model = TypeSafeDecisionModel.layer({ model: "jev-latest" }).pipe(Layer.provide(client))
      const evaluated = await Effect.runPromise(evaluatePrepared(item.prepared).pipe(Effect.provide(model)))
      expect(evaluated.status).toBe("evaluated")
      if (body === undefined) throw new Error(`${fixture.id}: no HTTP body`)
      expect(body).not.toContain(sentinel)
      expect(body).not.toContain(root)
      const parsed = JSON.parse(body) as {
        readonly model: string
        readonly state: unknown
        readonly questions: unknown
      }
      expect(parsed.model).toBe("jev-latest")
      expect(parsed.state).toEqual(input)
      expect(Object.keys(parsed.questions as object)).toEqual(item.prepared.input.rules.map((rule) => rule.id))
      measured.push({
        id: fixture.id,
        candidate: {
          status: "observed-offline-pinned-client-only",
          inputContract: TYPE_INPUT_CONTRACT,
          sourceFields,
          sourceFieldUtf8Bytes: sourceFields.reduce((sum, part) => sum + part.bytes, 0),
          localRequestBytes,
          httpBodyBytes: bytes(body),
          httpBodySha256: hash(body)
        }
      })
    }
    expect(measured).toHaveLength(12)
    expect(
      measured.every(
        (row) => row.candidate.sourceFields.length > 0 && row.candidate.httpBodyBytes > row.candidate.localRequestBytes
      )
    ).toBe(true)
  })
})
