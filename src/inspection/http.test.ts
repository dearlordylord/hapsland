import { readActivity } from "@hapsland/activity-observation/activity/status"
import { makeDirectHookDispatch } from "../../packages/hook-runtime/src/hooks/direct.ts"
import { monotonicNow, hookMonotonicMillis } from "@hapsland/resident-transport/resident/hook-clock"
import {
  residentRequestEffect,
  collectReadyEffect,
  beginComposedSubmissionEffect,
  releaseComposedSubmissionEffect,
  acknowledgeAdviceEffect
} from "@hapsland/resident-transport/resident/client"
import { Writable } from "node:stream"
import { submitDirectHookOutput, DirectHookSubmission } from "@hapsland/hook-runtime/resident/direct-hook-output"
import { HookOutput, makeWritableHookOutput } from "@hapsland/hook-runtime/resident/hook-output"
import { runClient } from "@hapsland/build-tooling/test-support/client-runtime"
import { request } from "node:http"
import { Effect, Scope, Exit, ConfigProvider } from "effect"
import { expect, it } from "vitest"
import { join } from "node:path"
import { writeFile, readFile, chmod, mkdir } from "node:fs/promises"
import { makeInspectionHttpServer } from "@hapsland/administration/inspection/http"
import { makeInspectionStorage } from "@hapsland/inspection-records/inspection/storage"
import { acquireResidentFixture } from "../resident/runtime-fixture.ts"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import { adaptCodexDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { addEvent, makeGitFixture, put, advicee } from "@hapsland/build-tooling/test-support/test-fixtures"
import { nativeDeferred } from "@hapsland/build-tooling/test-support/native-deferred"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { configuredRules, connectDefaultRuleFixture } from "@hapsland/build-tooling/test-support/default-rules"
import { readCredentialState } from "@hapsland/runtime-inputs/credentials/state"
import { decodeInspectionRecord } from "@hapsland/inspection-records/inspection/contract"

it("exposes exact retained bytes from a real resident's production provider transport", async () => {
  const root = await makeGitFixture()
  await put(
    root,
    "type.ts",
    'import type { Amount } from "./support";\r\ntype OrderCount = {\r\n\t/** 日本語 */\r\n\tvalue: Amount\r\n};\r\n'
  )
  await put(root, "support.ts", "export type Amount = number;\n")
  await put(root, "unrelated.ts", "type Unrelated = string;\n")
  await writeFile(
    join(root, ".hapsland.jsonc"),
    JSON.stringify({
      version: 1,
      sessionInspection: true,
      rules: connectDefaultRuleFixture(root).map((path, index) => ({
        path,
        ...(index === 0 ? { threshold: 0.6, message: "Inspect 日本語 cases\r\n\tprecisely" } : {})
      }))
    })
  )
  const stored = nativeDeferred<void>()
  let historyNow = Date.now()
  const history = makeInspectionStorage(join(root, "inspection"), {
    retentionMs: 86400000,
    storageBytes: 1048576,
    now: () => historyNow
  })
  const dispatched: Buffer[] = []
  const stages: Array<{ kind: string; reason?: string }> = []
  const resident = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
    inspectionPersistence: {
      write: (record, encoded, publication) =>
        history.write(record, encoded, publication).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              stages.push({
                kind: record.fact.kind,
                ...(record.fact.kind === "preparation-omission" ? { reason: record.fact.reason } : {})
              })
              if (record.fact.kind === "finding-fate" && record.fact.fate === "retained") stored.resolve()
            })
          )
        )
    },
    offlineHttpClient: HttpClient.make((request) => {
      if (request.body._tag !== "Uint8Array") throw new Error("missing original HTTP bytes")
      dispatched.push(Buffer.from(request.body.body))
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              model: "jev-latest",
              answers: Object.fromEntries(
                configuredRules.map((rule) => [
                  rule.id,
                  { type: "noul", noul: rule.id === "meaningless_combinations" ? 0.7 : 0 }
                ])
              ),
              usage: { input_tokens: 1, output_tokens: 1 }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        )
      )
    })
  })
  const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
  if (!observation) throw new Error("missing observation")
  const credentialPath = join(root, "credential-state")
  expect(
    (
      await Effect.runPromise(
        resident.admit(observation, {
          statePath: join(root, "consent"),
          userConfigPath: join(root, "absent-user"),
          controlled: null,
          credential: {
            name: "TYPESAFE_API_KEY",
            environmentValue: "INSPECTION_OFFLINE_KEY",
            generation: readCredentialState(credentialPath).generation,
            statePath: credentialPath
          }
        })
      )
    ).status
  ).toBe("accepted")
  await Effect.runPromise(resident.whenIdle())
  expect(dispatched.length, JSON.stringify(stages)).toBe(1)
  await stored.promise
  await Effect.runPromise(resident.close)
  const scope = await Effect.runPromise(Scope.make())
  try {
    const server = await Effect.runPromise(
      makeInspectionHttpServer(history).pipe(Effect.provideService(Scope.Scope, scope))
    )
    const value: unknown = await (await fetch(`${server.url}snapshot`)).json()
    if (typeof value !== "object" || value === null || !("records" in value) || !Array.isArray(value.records))
      throw new Error("missing snapshot")
    const records = value.records.map(decodeInspectionRecord)
    const transport = records.find((record) => record.fact.kind === "transport-invoked")?.fact
    expect(transport?.kind).toBe("transport-invoked")
    if (transport?.kind !== "transport-invoked" || transport.payload.status !== "available")
      throw new Error("missing retained transport bytes")
    const reads = records.filter((record) => record.fact.kind === "preparation-read").map((record) => record.fact)
    expect(reads).toEqual(
      expect.arrayContaining([
        { kind: "preparation-read", path: "type.ts" },
        { kind: "preparation-read", path: "support.ts" }
      ])
    )
    expect(reads).not.toContainEqual({ kind: "preparation-read", path: "unrelated.ts" })
    const input = records.find((record) => record.fact.kind === "model-input")?.fact
    if (input?.kind !== "model-input" || input.payload.status !== "available") throw new Error("missing model input")
    expect(JSON.parse(input.payload.encoded)).toMatchObject({
      artifact: { domain: "type.ts", name: "OrderCount" },
      evidence: {
        nodes: expect.arrayContaining([
          expect.objectContaining({ domain: "support.ts", name: "Amount", source: "export type Amount = number;" })
        ])
      }
    })
    const policy = records.find((record) => record.fact.kind === "unit-policy")?.fact
    expect(policy).toMatchObject({
      kind: "unit-policy",
      activity: "live",
      provider: "jev",
      model: "jev-latest",
      interpretation: "probability-strictly-greater-than-threshold",
      payload: {
        status: "available",
        rules: expect.arrayContaining([
          expect.objectContaining({
            ruleId: "meaningless_combinations",
            source: expect.stringContaining("meaningless_combinations.json"),
            threshold: 0.6,
            message: "Inspect 日本語 cases\r\n\tprecisely",
            question: configuredRules[0]!.decision.instructions,
            criteria: configuredRules[0]!.decision.criteria
          })
        ])
      }
    })
    const answers = records.find((record) => record.fact.kind === "validated-answers")?.fact
    expect(answers).toMatchObject({
      answers: expect.arrayContaining([{ ruleId: "meaningless_combinations", probability: 0.7 }])
    })
    const findings = records.find((record) => record.fact.kind === "interpreted-findings")?.fact
    expect(findings).toMatchObject({
      payload: {
        status: "available",
        findings: [
          expect.objectContaining({
            ruleId: "meaningless_combinations",
            probability: 0.7,
            message: "Inspect 日本語 cases\r\n\tprecisely",
            path: "type.ts",
            declaration: "OrderCount"
          })
        ]
      }
    })
    expect(records.find((record) => record.fact.kind === "evaluation-outcome")?.fact).toMatchObject({
      outcome: "findings"
    })
    expect(dispatched).toHaveLength(1)
    expect(Buffer.from(transport.payload.encoded, "base64").equals(dispatched[0]!)).toBe(true)
    expect(transport.payload.byteLength).toBe(dispatched[0]!.byteLength)
    const transportRecord = records.find((record) => record.fact.kind === "transport-invoked")!
    const payloadUrl = `${server.url}payload/${transportRecord.source.id}/${transportRecord.sequence}`
    const exact = await (await fetch(payloadUrl)).json()
    expect(exact).toEqual({
      version: 1,
      sourceId: transportRecord.source.id,
      sequence: transportRecord.sequence,
      representation: "http-body-base64",
      ...transport.payload
    })
    expect(await (await fetch(`${server.url}payload/${transportRecord.source.id}/999999`)).json()).toMatchObject({
      status: "missing",
      reason: "not-retained"
    })
    expect((await fetch(payloadUrl, { headers: { origin: "https://evil.invalid" } })).status).toBe(403)
    expect((await fetch(`${payloadUrl}?source=other`)).status).toBe(404)
    const stateRecord = records.find((record) => record.fact.kind === "recording-state")!
    expect(
      await (await fetch(`${server.url}payload/${stateRecord.source.id}/${stateRecord.sequence}`)).json()
    ).toMatchObject({ status: "missing", reason: "no-exact-payload" })
    const inputRecord = records.find((record) => record.fact.kind === "model-input")!
    expect(await (await fetch(`${server.url}payload/${inputRecord.source.id}/${inputRecord.sequence}`)).json()).toEqual(
      {
        version: 1,
        sourceId: inputRecord.source.id,
        sequence: inputRecord.sequence,
        representation: "decision-model-json",
        ...input.payload
      }
    )
    await chmod(join(root, "inspection"), 0o777)
    try {
      expect(await (await fetch(payloadUrl)).json()).toEqual({
        version: 1,
        sourceId: transportRecord.source.id,
        sequence: transportRecord.sequence,
        status: "missing",
        reason: "history-unavailable"
      })
    } finally {
      await chmod(join(root, "inspection"), 0o700)
    }
    historyNow += 2 * 86400000
    expect(await (await fetch(payloadUrl)).json()).toEqual({
      version: 1,
      sourceId: transportRecord.source.id,
      sequence: transportRecord.sequence,
      status: "missing",
      reason: "expired"
    })
    expect(dispatched[0]!.toString()).not.toContain("INSPECTION_OFFLINE_KEY")
    expect(JSON.stringify(records)).not.toContain("INSPECTION_OFFLINE_KEY")
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
})

it("exposes exceptional provider failure without a clear result, duplicate outcome or private response body", async () => {
  const root = await makeGitFixture()
  await put(root, "type.ts", "type OrderCount = number;\n")
  await writeFile(
    join(root, ".hapsland.jsonc"),
    JSON.stringify({ version: 1, rules: connectDefaultRuleFixture(root), sessionInspection: true })
  )
  const history = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
  const published = nativeDeferred<void>()
  const dispatched: Buffer[] = []
  const settled: string[] = []
  const privateBody = "PRIVATE_PROVIDER_ERROR_BODY"
  const resident = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
    jevRequestObserver: (item) => {
      if (item.stage === "settled") settled.push(item.outcome ?? "missing")
    },
    inspectionPersistence: {
      write: (record, encoded, publication) =>
        history.write(record, encoded, publication).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              if (record.fact.kind === "evaluation-outcome") published.resolve()
            })
          )
        )
    },
    offlineHttpClient: HttpClient.make((request) => {
      if (request.body._tag !== "Uint8Array") throw new Error("missing dispatched bytes")
      dispatched.push(Buffer.from(request.body.body))
      return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(privateBody, { status: 503 })))
    })
  })
  const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
  if (!observation) throw new Error("missing observation")
  const credentialPath = join(root, "credential-state")
  expect(
    (
      await Effect.runPromise(
        resident.admit(observation, {
          statePath: join(root, "consent"),
          userConfigPath: join(root, "absent-user"),
          controlled: null,
          credential: {
            name: "TYPESAFE_API_KEY",
            environmentValue: "PRIVATE_OFFLINE_CREDENTIAL",
            generation: readCredentialState(credentialPath).generation,
            statePath: credentialPath
          }
        })
      )
    ).status
  ).toBe("accepted")
  await published.promise
  await Effect.runPromise(resident.whenIdle())
  expect(settled).toEqual(["backendFailure"])
  expect(dispatched).toHaveLength(1)
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* makeInspectionHttpServer(history)
        yield* Effect.promise(async () => {
          const snapshot = await (await fetch(`${server.url}snapshot`)).json()
          if (
            typeof snapshot !== "object" ||
            snapshot === null ||
            !("records" in snapshot) ||
            !Array.isArray(snapshot.records)
          )
            throw new Error("missing public snapshot records")
          const records = snapshot.records.map(decodeInspectionRecord)
          expect(
            records.filter((record) => record.fact.kind === "evaluation-outcome").map((record) => record.fact)
          ).toEqual([{ kind: "evaluation-outcome", outcome: "backend" }])
          expect(
            records.some((record) => record.fact.kind === "validated-answers" || record.fact.kind === "agent-message")
          ).toBe(false)
          const transport = records.find((record) => record.fact.kind === "transport-invoked")
          if (!transport) throw new Error("missing retained transport")
          const payload = await (
            await fetch(`${server.url}payload/${transport.source.id}/${transport.sequence}`)
          ).json()
          expect(payload).toMatchObject({
            status: "available",
            sourceId: transport.source.id,
            sequence: transport.sequence
          })
          if (
            typeof payload !== "object" ||
            payload === null ||
            !("encoded" in payload) ||
            typeof payload.encoded !== "string"
          )
            throw new Error("missing public exact payload")
          expect(Buffer.from(payload.encoded, "base64").equals(dispatched[0]!)).toBe(true)
          expect(JSON.stringify(snapshot)).not.toContain(privateBody)
          expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_OFFLINE_CREDENTIAL")
          expect(dispatched).toHaveLength(1)
        })
      })
    )
  )
})

it("serves pre-launch real resident history through protected HTTP and SSE after that resident closes", async () => {
  const root = await makeGitFixture()
  await put(root, "type.ts", "type OrderCount = number\n")
  await writeFile(
    join(root, ".hapsland.jsonc"),
    JSON.stringify({ version: 1, rules: connectDefaultRuleFixture(root), sessionInspection: true })
  )
  const stored = nativeDeferred<void>()
  const history = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
  const resident = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
    inspectionPersistence: {
      write: (record, encoded, publication) =>
        history.write(record, encoded, publication).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              if (record.fact.kind === "evaluation-outcome") stored.resolve()
            })
          )
        )
    }
  })
  const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
  if (!observation) throw new Error("missing fixture observation")
  expect(
    (
      await Effect.runPromise(
        resident.admit(observation, {
          statePath: join(root, "consent"),
          userConfigPath: join(root, "absent-user"),
          credential: null,
          controlled: { answers: {} }
        })
      )
    ).status
  ).toBe("accepted")
  await stored.promise
  await Effect.runPromise(resident.close)
  const scope = await Effect.runPromise(Scope.make())
  try {
    const server = await Effect.runPromise(
      makeInspectionHttpServer(history).pipe(Effect.provideService(Scope.Scope, scope))
    )
    const response = await fetch(`${server.url}snapshot`)
    expect(response.status).toBe(200)
    const snapshot = await response.json()
    expect(snapshot).toMatchObject({
      records: expect.arrayContaining(
        ["recording-state", "edit-received", "edit-admission", "unit-prepared"].map((kind) =>
          expect.objectContaining({ fact: expect.objectContaining({ kind }) })
        )
      )
    })
    const page = await fetch(server.url)
    expect(page.status).toBe(200)
    expect(page.headers.get("content-security-policy")).toContain("script-src 'sha256-")
    expect(await page.text()).toContain("Hapsland inspection")
    expect(snapshot).toMatchObject({
      records: expect.arrayContaining([
        expect.objectContaining({
          fact: expect.objectContaining({ kind: "model-input", representation: "decision-model-json" })
        })
      ])
    })
    expect((await fetch(`${server.origin}/snapshot`)).status).toBe(404)
    expect((await fetch(`${server.url}snapshot`, { headers: { origin: "https://evil.invalid" } })).status).toBe(403)
    const hostileHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const call = request(`${server.url}snapshot`, { headers: { host: "evil.invalid" } }, (response) => {
        response.resume()
        response.on("end", () => resolve(response.statusCode))
      })
      call.on("error", reject)
      call.end()
    })
    expect(hostileHostStatus).toBe(403)
    expect((await fetch(`${server.url}snapshot`, { method: "POST" })).status).toBe(405)
    const events = await fetch(`${server.url}events`)
    expect(events.headers.get("content-type")).toContain("text/event-stream")
    const reader = events.body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toContain('"edit-admission"')
    await reader.cancel()
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
})

it("rejects direct network exposure before opening a server", async () => {
  const history = makeInspectionStorage("/unused", { retentionMs: 1000, storageBytes: 1048576 })
  await expect(
    Effect.runPromise(Effect.scoped(makeInspectionHttpServer(history, { host: "0.0.0.0" })))
  ).rejects.toThrow("loopback")
})

it.each([true, false])(
  "retains the resident message through the public feed independently of acknowledgement: %s",
  async (acknowledged) => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number;\n")
    await put(root, "other.ts", "type OtherCount = number;\n")
    await writeFile(
      join(root, ".hapsland.jsonc"),
      JSON.stringify({
        version: 1,
        sessionInspection: true,
        rules: connectDefaultRuleFixture(root)
          .slice(0, 1)
          .map((path, index) => ({ path, ...(index === 0 ? { message: "Inspect 日本語\r\n\tcases" } : {}) }))
      })
    )
    const stored = nativeDeferred<void>()
    const history = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
    const resident = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      inspectionPersistence: {
        write: (record, encoded, publication) =>
          history.write(record, encoded, publication).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "agent-message") stored.resolve()
              })
            )
          )
      }
    })
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (!observation) throw new Error("missing observation")
    const dispatch = {
      statePath: join(root, "consent"),
      userConfigPath: join(root, "absent-user"),
      credential: null,
      controlled: {
        answers: Object.fromEntries(
          configuredRules.map((rule, index) => [
            rule.id,
            { _tag: "Probability" as const, probability: index === 0 ? 0.9 : 0 }
          ])
        )
      }
    }
    expect((await Effect.runPromise(resident.admit(observation, dispatch, true))).status).toBe("accepted")
    await Effect.runPromise(resident.whenIdle())
    const other = await Effect.runPromise(
      adaptCodexDirectEvent(addEvent(root, ["other.ts"], { tool_use_id: "inspection-other-edit" }))
    )
    if (!other) throw new Error("missing second edit")
    expect((await Effect.runPromise(resident.admit(other, dispatch, true))).status).toBe("accepted")
    await Effect.runPromise(resident.whenIdle())
    const ackGate = join(root, "ack-reply")
    if (!acknowledged) await writeFile(`${ackGate}.enabled`, "enabled\n")
    await Effect.runPromise(
      resident
        .listen()
        .pipe(
          Effect.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown(acknowledged ? {} : { REVIEW_RESIDENT_ACK_RESPONSE_GATE_PATH: ackGate })
            )
          )
        )
    )
    const collectionAt = Date.now()
    const response = await runClient(collectReadyEffect(root, observation.advicee, dispatch, resident.paths)).catch(
      (cause) => {
        throw new Error(`collection failed after ${Date.now() - collectionAt}ms`, { cause })
      }
    )
    if (!response) throw new Error("missing advice")
    expect(response.findingCount).toBe(2)
    const bytes: Array<Buffer> = []
    const stream = new Writable({
      write: (chunk, _encoding, complete) => {
        bytes.push(Buffer.from(chunk))
        complete()
      }
    })
    const collected = response
    const scope = await Effect.runPromise(Scope.make())
    try {
      const outcome = await Effect.runPromise(
        submitDirectHookOutput(
          { value: response.output, collected },
          { composed: true, claude: true, deadlineAt: (await Effect.runPromise(hookMonotonicMillis)) + 5000 }
        ).pipe(
          Effect.provideService(HookOutput, makeWritableHookOutput(stream)),
          Effect.provideService(DirectHookSubmission, {
            begin: beginComposedSubmissionEffect,
            release: releaseComposedSubmissionEffect,
            writeCodex: () => Effect.die("unexpected synchronous write"),
            record: () => Effect.void,
            acknowledge: (advice) =>
              acknowledgeAdviceEffect(advice).pipe(
                Effect.tap((result) => Effect.sync(() => expect(result).toBe(acknowledged)))
              )
          })
        )
      )
      expect(outcome).toBe("written")
      if (!acknowledged) expect(await readFile(`${ackGate}.entered`, "utf8")).toBe("entered\n")
      await stored.promise
      stream.end()
      const server = await Effect.runPromise(
        makeInspectionHttpServer(history).pipe(Effect.provideService(Scope.Scope, scope))
      )
      const body: unknown = await (await fetch(`${server.url}snapshot`)).json()
      if (typeof body !== "object" || body === null || !("records" in body) || !Array.isArray(body.records))
        throw new Error("missing snapshot")
      const records = body.records.map(decodeInspectionRecord)
      const messages = records.filter((record) => record.fact.kind === "agent-message")
      expect(messages).toHaveLength(1)
      const message = messages[0]!
      if (message.fact.kind !== "agent-message") throw new Error("missing resident message")
      expect(message.fact.message).toEqual({
        status: "available",
        text: response.output.hookSpecificOutput.additionalContext
      })
      expect(await (await fetch(`${server.url}payload/${message.source.id}/${message.sequence}`)).json()).toEqual({
        version: 1,
        sourceId: message.source.id,
        sequence: message.sequence,
        ...message.fact.message
      })
      expect(message.correlation.batchId).toBe(response.token)
      expect(message.fact.recipient).toEqual({
        turnId: observation.advicee.turnId,
        toolUseId: observation.advicee.toolUseId
      })
      expect(message.fact.findingIds).toHaveLength(response.findingCount)
      expect(message.fact.evaluations.map((member) => member.evaluationId).sort()).toEqual(
        records
          .filter((record) => record.fact.kind === "model-input")
          .map((record) => record.correlation.evaluationId)
          .sort()
      )
      expect(
        new Set(
          records.filter((record) => record.fact.kind === "model-input").map((record) => record.correlation.receiptId)
        ).size
      ).toBe(2)
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void))
    }
  }
)

it("reads fresh history after each completed dashboard request", async () => {
  let reads = 0
  const scope = await Effect.runPromise(Scope.make())
  try {
    const server = await Effect.runPromise(
      makeInspectionHttpServer({
        snapshot: () =>
          Effect.sync(() => {
            reads++
            return { records: [], losses: [] }
          })
      }).pipe(Effect.provideService(Scope.Scope, scope))
    )
    for (let expected = 1; expected <= 2; expected++) {
      const response = await fetch(`${server.url}snapshot`)
      expect(response.status).toBe(200)
      await response.json()
      expect(reads).toBe(expected)
    }
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
})

it.each([
  { label: "mjs", path: "excluded.mjs", code: "file-extension" },
  { label: "ts", path: "excluded.ts" },
  { label: "mixed", path: "excluded.mjs", code: "file-extension" },
  { label: "disabled-language", path: "excluded.ts", code: "language-not-enabled", configuration: { languages: [] } },
  { label: "empty-includes", path: "excluded.ts", code: "empty-includes", configuration: { includes: [] } },
  { label: "not-included", path: "excluded.ts", code: "not-included", configuration: { includes: ["src/**"] } },
  { label: "excluded", path: "excluded.ts", code: "excluded", configuration: { excludes: ["excluded.ts"] } },
  { label: "sensitive", path: ".env.secret", code: "sensitive" },
  { label: "generated", path: "generated/excluded.ts", code: "generated-or-vendor" },
  { label: "ignored", path: "excluded.ts", code: "git-ignored" }
] as const)("exposes native $label ingress without review authority or source disclosure", async (scenario) => {
  const extension = scenario.label
  const mixed = extension === "mixed"
  const path = scenario.path
  const code = "code" in scenario ? scenario.code : undefined
  const root = await makeGitFixture()
  await mkdir(join(root, ".env.local"))
  const secret = "EXCLUDED_SOURCE_MUST_NOT_ENTER_INSPECTION"
  await put(root, path, `const value = '${secret}';\n`)
  const rules = mixed ? connectDefaultRuleFixture(root).slice(0, 1) : []
  await put(
    root,
    ".hapsland.jsonc",
    JSON.stringify({
      version: 1,
      sessionInspection: true,
      rules,
      ...("configuration" in scenario ? scenario.configuration : {})
    })
  )
  if (extension === "ignored") await put(root, ".gitignore", "excluded.ts\n")
  if (mixed) await put(root, "supported.ts", "export type OrderCount = number;\n")
  const paths = residentPaths(join(root, "runtime"))
  const history = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
  const published = nativeDeferred<void>()
  let requests = 0
  const captures: string[] = []
  const resident = await acquireResidentFixture(paths, undefined, {
    captureSource: (...args) => {
      captures.push(args[1].relativePath)
      if (!mixed || args[1].relativePath === path) return Effect.die("excluded native edit entered source capture")
      return captureStable(...args)
    },
    inspectionPersistence: {
      write: (record, encoded, publication) =>
        history.write(record, encoded, publication).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              if (
                record.fact.kind ===
                (mixed ? "evaluation-outcome" : extension === "ts" ? "diagnostic" : "edit-received")
              )
                published.resolve()
            })
          )
        )
    },
    offlineHttpClient: HttpClient.make(() => {
      requests += 1
      return Effect.die("excluded edit requested review")
    })
  })
  await Effect.runPromise(resident.listen())
  const event = addEvent(root, mixed ? ["supported.ts", path] : [path], {
    tool_input: {
      command: `*** Begin Patch\n${mixed ? "*** Add File: supported.ts\n+export type OrderCount = number;\n" : ""}*** Add File: ${path}\n+const value = '${secret}';\n*** End Patch`
    }
  })
  expect(
    await Effect.runPromise(
      residentRequestEffect(paths, {
        requestRoute: "shared",
        operation: "register-edit",
        lifetime: resident.lifetime,
        root,
        advicee: advicee({ hostVersion: "0.160.1" }),
        startedAt: monotonicNow(),
        userConfigPath: join(root, "absent-user")
      })
    )
  ).toMatchObject({ status: "advanced" })
  const dispatch = makeDirectHookDispatch({
    deadline: (await Effect.runPromise(hookMonotonicMillis)) + 3900,
    controlledWriter: true,
    composedEdit: true
  })
  expect(
    await runClient(
      dispatch
        .runDirectCodexHook(
          event,
          "0.160.1",
          mixed
            ? {
                answers: Object.fromEntries(
                  configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0 }])
                )
              }
            : undefined,
          join(root, "consent"),
          join(root, "activity"),
          join(root, "absent-user")
        )
        .pipe(
          Effect.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ REVIEW_RESIDENT_DIR: paths.directory, REVIEW_CREDENTIAL_STATE_PATH: root })
            )
          )
        )
    )
  ).toEqual({ handled: true, output: {} })
  await published.promise
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* makeInspectionHttpServer(history)
        yield* Effect.promise(async () => {
          const snapshot: unknown = await (await fetch(`${server.url}snapshot`)).json()
          if (
            typeof snapshot !== "object" ||
            snapshot === null ||
            !("records" in snapshot) ||
            !Array.isArray(snapshot.records)
          )
            throw new Error("missing public records")
          const records = snapshot.records.map(decodeInspectionRecord)
          const received = records.find((record) => record.fact.kind === "edit-received")
          if (received === undefined || received.fact.kind !== "edit-received")
            throw new Error("missing native receipt")
          expect(received.fact.candidates).toEqual([
            ...(mixed
              ? [{ position: 0, operation: "add", path: "supported.ts", selection: { status: "selected" } }]
              : []),
            {
              position: mixed ? 1 : 0,
              operation: "add",
              path,
              selection:
                code !== undefined
                  ? {
                      status: "excluded",
                      diagnostic: {
                        stage: "selection",
                        code,
                        args: code === "file-extension" ? { extension: ".mjs" } : {}
                      }
                    }
                  : { status: "selected" }
            }
          ])
          expect(received.scope.root).toBe(root)
          if (!mixed && code !== undefined)
            expect(
              readActivity({
                statePath: join(root, "activity"),
                root,
                sessionId: received.scope.sessionId ?? "",
                resident: { available: true, lifetime: resident.lifetime }
              })
            ).toMatchObject({ kind: "skipped", counts: { skipped: 1 } })
          if (extension === "ts")
            expect(records.find((record) => record.fact.kind === "diagnostic")?.fact).toEqual({
              kind: "diagnostic",
              diagnostic: { stage: "admission", code: "dispatch-unavailable", args: {} }
            })
          expect(
            records.some((record) =>
              ["preparation-read", "model-input", "transport-invoked"].includes(record.fact.kind)
            )
          ).toBe(mixed)
          expect(JSON.stringify(snapshot)).not.toContain(secret)
        })
      })
    )
  )
  if (mixed) {
    expect(captures).toContain("supported.ts")
    expect(captures).not.toContain(path)
  } else expect(captures).toEqual([])
  expect(requests).toBe(0)
  expect(await Effect.runPromise(resident.stats())).toMatchObject({ pendingAdvice: 0 })
})
