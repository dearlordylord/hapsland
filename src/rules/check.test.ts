import { afterEach, describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import * as ConfigProvider from "effect/ConfigProvider"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import { makeGitFixture, put, addEvent } from "../direct-event/test-fixtures.ts"
import { discoverPhysicalWorkingTreeRoot } from "../repository/root.ts"
import { prepareSourceLine, prepareObservation } from "../direct-event/pipeline.ts"
import { adaptCodexAdd } from "../direct-event/adapter.ts"
import { loadReviewSettings } from "../runtime/review-config.ts"
import { checkRuleAtLine, formatRuleCheck } from "./check.ts"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
const fixture = async (requires: readonly string[] = ["root-declaration"]) => {
  const root = await makeGitFixture()
  roots.push(root)
  await put(
    root,
    "rule.json",
    JSON.stringify({
      version: 1,
      id: "test/concern",
      question: "Does this declaration admit an invalid state?",
      criteria: { false: "Every state has meaning", true: "An invalid state is admitted" },
      threshold: 0.7,
      message: "Make the invalid state unrepresentable",
      inputs: [{ languages: ["typescript"], kind: "type", requires }]
    })
  )
  await put(
    root,
    "function-rule.json",
    JSON.stringify({
      version: 1,
      id: "test/function",
      question: "Does the body rely on undeclared structure?",
      criteria: { false: "Declared", true: "Undeclared" },
      message: "Declare the body's assumptions",
      inputs: [{ languages: ["typescript"], kind: "function", requires: ["signature", "body"] }]
    })
  )
  await put(root, ".hapsland.jsonc", JSON.stringify({ version: 1, rules: ["rule.json", "function-rule.json"] }))
  await put(root, "empty-user.json", JSON.stringify({ version: 1 }))
  await put(root, "related.ts", "export interface Related { value: string }")
  await put(
    root,
    "target.ts",
    'import type { Related } from "./related"\n\nexport interface Selected {\n  value: Related\n}\n\ntype UnrelatedSentinel = { secret: string }\n\nexport function selectedFunction(value: string): string {\n  return value.trim()\n}\n'
  )
  return root
}
const configuration = (root: string, extra: Record<string, string> = {}) =>
  ConfigProvider.layer(
    ConfigProvider.fromUnknown({
      REVIEW_USER_CONFIG_PATH: join(root, "empty-user.json"),
      REVIEW_CREDENTIAL_STATE_PATH: join(root, "credential-state.json"),
      TYPESAFE_API_KEY: "fixture-only-key",
      ...extra
    })
  )
const run = (root: string, line: number, httpClient: HttpClient.HttpClient, id?: string) =>
  Effect.runPromise(
    checkRuleAtLine({ path: "target.ts", line, id }, { cwd: root, httpClient }).pipe(
      Effect.provide(configuration(root))
    )
  )
const transport = (probability: number, beforeResponse: () => Promise<void> = async () => {}) => {
  const requests: Array<{ authorization: string | undefined; body: string }> = []
  const httpClient = HttpClient.make((request) =>
    Effect.gen(function* () {
      const body = request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : ""
      requests.push({ authorization: request.headers.authorization, body })
      const payload = JSON.parse(body)
      yield* Effect.promise(beforeResponse)
      return HttpClientResponse.fromWeb(
        request,
        Response.json({
          model: "jev-latest",
          answers: Object.fromEntries(
            Object.keys(payload.questions).map((id) => [id, { type: "noul", noul: probability }])
          ),
          usage: { input_tokens: 1, output_tokens: 1 }
        })
      )
    })
  )
  return { httpClient, requests }
}

describe("one-off file and line rule checks", () => {
  it("shares the exact hook input without manufacturing an agent advicee", async () => {
    const root = await fixture()
    const settings = await Effect.runPromise(
      loadReviewSettings(root, { userConfigPath: join(root, "empty-user.json") })
    )
    const repository = await Effect.runPromise(discoverPhysicalWorkingTreeRoot(root))
    const manual = await Effect.runPromise(
      prepareSourceLine({ ...repository, path: "target.ts", line: 4 }, { settings })
    )
    const observation = await Effect.runPromise(adaptCodexAdd(addEvent(root, ["target.ts"])))
    if (observation === undefined) throw new Error("Missing fixture observation")
    const hook = await Effect.runPromise(
      prepareObservation(observation, { settings, controlledWriter: true, advicee: observation.advicee })
    )
    const selected = manual.outcomes.find((outcome) => outcome.status === "ready")
    if (selected?.status !== "ready") throw new Error("Missing selected declaration")
    const matching = hook.outcomes.find(
      (outcome) => outcome.status === "ready" && outcome.prepared.input.declaration.name === "Selected"
    )
    if (matching?.status !== "ready") throw new Error("Missing hook declaration")
    expect(selected.prepared.input).toEqual(matching.prepared.input)
    expect(selected.prepared.identity).toBe(matching.prepared.identity)
    expect(selected.prepared).not.toHaveProperty("advicee")
    expect(manual.outcomes.filter((outcome) => outcome.status === "ready")).toHaveLength(1)
  })

  it.each([0.7, 0.71])(
    "returns probability %s including clear results, with a strict threshold",
    async (probability) => {
      const root = await fixture()
      const fake = transport(probability)
      const result = await run(root, 4, fake.httpClient, "test/concern")
      expect(result.status).toBe("evaluated")
      expect(result.classifierCalls).toBe(1)
      expect(result.results).toEqual([
        {
          ruleId: "test/concern",
          probability,
          threshold: 0.7,
          finding: probability > 0.7,
          message: "Make the invalid state unrepresentable"
        }
      ])
      expect(fake.requests).toHaveLength(1)
      expect(fake.requests[0]?.body).toContain("Selected")
      expect(fake.requests[0]?.body).toContain("Related")
      expect(fake.requests[0]?.body).not.toContain("UnrelatedSentinel")
      expect(fake.requests[0]?.body).not.toContain("fixture-only-key")
      expect(fake.requests[0]?.authorization).toBe("Bearer fixture-only-key")
      expect(formatRuleCheck(result)).toContain("Related source: related.ts")
      expect(JSON.stringify(result)).not.toContain("fixture-only-key")
    }
  )

  it.each([
    ["type.rs", "struct Selected {\n  value: String,\n}\n"],
    ["type.bend", "type Selected is Data:\n  Selected{value: U32}\n"]
  ])("selects a supported datatype in %s using shared language discovery", async (path, source) => {
    const root = await fixture()
    await put(root, path, source)
    await put(
      root,
      "rule.json",
      JSON.stringify({
        version: 1,
        id: "test/concern",
        question: "Invalid state?",
        criteria: { false: "Valid", true: "Invalid" },
        message: "Review this type",
        inputs: [{ languages: ["rust", "bend"], kind: "type", requires: ["root-declaration"] }]
      })
    )
    const fake = transport(0.4)
    const result = await Effect.runPromise(
      checkRuleAtLine({ path, line: 2 }, { cwd: root, httpClient: fake.httpClient }).pipe(
        Effect.provide(configuration(root))
      )
    )
    expect(result.status).toBe("evaluated")
    expect(result.results.map((rule) => rule.ruleId)).toEqual(["test/concern"])
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0]?.body).toContain("Selected")
  })

  it("selects a function from a body line through the shared function branch", async () => {
    const root = await fixture()
    const fake = transport(0.3)
    const result = await run(root, 10, fake.httpClient)
    expect(result.status).toBe("evaluated")
    expect(result.results.map((rule) => rule.ruleId)).toEqual(["test/function"])
    expect(fake.requests[0]?.body).toContain("selectedFunction")
    expect(fake.requests[0]?.body).not.toContain("UnrelatedSentinel")
  })

  it.each([2, 6, 12, 1000])("does not send a request for line %s outside a supported declaration", async (line) => {
    const root = await fixture()
    const fake = transport(0.9)
    const result = await run(root, line, fake.httpClient)
    expect(result.status).toBe("skipped")
    expect(result.classifierCalls).toBe(0)
    expect(result.results).toEqual([])
    expect(fake.requests).toEqual([])
  })

  it("rejects ambiguous declarations sharing a line instead of reviewing multiple roots", async () => {
    const root = await fixture()
    await put(root, "target.ts", "type First = string; type Second = number")
    const fake = transport(0.9)
    const result = await run(root, 1, fake.httpClient)
    expect(result.status).toBe("skipped")
    expect(result).toHaveProperty("reason", "ambiguous-line")
    expect(formatRuleCheck(result)).toContain("ambiguous-line")
    expect(fake.requests).toEqual([])
  })

  it.each([
    "type Selected = string; function first(): number { return 1 }",
    "type Selected = string; function first(): number { return 1 } function second(): number { return 2 }"
  ])("rejects cross-branch ambiguity before rule eligibility: %s", async (source) => {
    const root = await fixture()
    await put(root, "target.ts", source)
    await put(root, ".hapsland.jsonc", JSON.stringify({ version: 1, rules: ["rule.json"] }))
    const fake = transport(0.9)
    const result = await run(root, 1, fake.httpClient)
    expect(result.status).toBe("skipped")
    expect(result).toHaveProperty("reason", "ambiguous-line")
    expect(result.classifierCalls).toBe(0)
    expect(fake.requests).toEqual([])
  })

  it("respects file scope and missing required related evidence", async () => {
    const root = await fixture(["root-declaration", "resolved-outbound-types", "selected-source-type-closure"])
    await rm(join(root, "related.ts"))
    const fake = transport(0.9)
    const incomplete = await run(root, 4, fake.httpClient)
    expect(incomplete.status).toBe("skipped")
    expect(incomplete.omissions).toContainEqual({
      path: "target.ts",
      declaration: "Selected",
      reason: "no-applicable-rule"
    })
    await put(root, ".hapsland.jsonc", JSON.stringify({ version: 1, rules: ["rule.json"], excludes: ["target.ts"] }))
    const excluded = await run(root, 4, fake.httpClient)
    expect(excluded.status).toBe("skipped")
    expect(excluded.analysis).toContainEqual({ status: "incomplete", path: "target.ts", reason: "excluded" })
    expect(fake.requests).toEqual([])
  })

  it("uses the normal project key-file discovery seam", async () => {
    const root = await fixture()
    await put(root, ".env.local", "TYPESAFE_API_KEY=project-file-key\n")
    const fake = transport(0.2)
    const result = await Effect.runPromise(
      checkRuleAtLine({ path: "target.ts", line: 4 }, { cwd: root, httpClient: fake.httpClient }).pipe(
        Effect.provide(configuration(root, { TYPESAFE_API_KEY: "" }))
      )
    )
    expect(result.status).toBe("evaluated")
    expect(fake.requests[0]?.authorization).toBe("Bearer project-file-key")
    expect(JSON.stringify(result)).not.toContain("project-file-key")
  })

  it("keeps explicit credential references environment-only and reports missing keys without a call", async () => {
    const root = await fixture()
    await put(root, "empty-user.json", JSON.stringify({ version: 1, credentialEnvVar: "CUSTOM_REVIEW_KEY" }))
    await put(root, ".env.local", "TYPESAFE_API_KEY=should-not-be-used\n")
    const fake = transport(0.9)
    const result = await run(root, 4, fake.httpClient)
    expect(result.status).toBe("unavailable")
    expect(result).toHaveProperty("reason", "credential-missing")
    expect(fake.requests).toEqual([])
  })

  it("does not present probabilities as current when code changes during the request", async () => {
    const root = await fixture()
    const fake = transport(0.9, async () => {
      await put(root, "related.ts", "export interface Related { value: number }")
    })
    const result = await run(root, 4, fake.httpClient)
    expect(result.status).toBe("unavailable")
    expect(result).toHaveProperty("reason", "stale")
    expect(result.results).toEqual([])
    expect(fake.requests).toHaveLength(1)
  })

  it("reports invalid backend answers as unavailable, not clear", async () => {
    const root = await fixture()
    const httpClient = HttpClient.make((request) =>
      Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ model: "jev-latest", answers: {} })))
    )
    const result = await run(root, 4, httpClient)
    expect(result.status).toBe("unavailable")
    expect(result.results).toEqual([])
  })

  it("rejects disabled/unknown rules and invalid lines before calling the classifier", async () => {
    const root = await fixture()
    const fake = transport(0.9)
    await expect(run(root, 4, fake.httpClient, "unknown")).rejects.toThrow("not enabled")
    await expect(run(root, 0, fake.httpClient)).rejects.toThrow("positive one-based integer")
    expect(fake.requests).toEqual([])
  })
})
