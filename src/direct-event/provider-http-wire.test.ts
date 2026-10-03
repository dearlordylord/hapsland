/** Offline observation of the pinned TypeSafe provider's actual encoded HTTP request. */
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Decision from "effect/ai/Decision";
import * as DecisionModel from "effect/ai/DecisionModel";
import { DEFAULT_API_BASE, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import { encodedProviderHttpBodyBytes } from "./provider-body-size.ts";

type LocalRequest = {
  readonly input: unknown;
  readonly decisions: Readonly<Record<string, {
    readonly _tag: "Probability";
    readonly instructions: string;
    readonly criteria: { readonly false: string; readonly true: string };
  }>>;
};
type Candidate = { readonly completeRequest: LocalRequest; readonly completeRequestBytes: number };
type ComparatorArm = { readonly localRequest: LocalRequest; readonly localRequestBytes: number };
type Comparators = { readonly cases: ReadonlyArray<{ readonly id: string; readonly arms: {
  readonly focusedDiff?: ComparatorArm;
  readonly wholeFile?: ComparatorArm;
  readonly v1Type?: ComparatorArm;
} }> };
type Observation = { readonly id: string; readonly localRequestBytes: number; readonly httpBodyBytes: number;
  readonly httpBodySha256: string; readonly stateBytes: number; readonly questionsBytes: number;
  readonly questionKeys: ReadonlyArray<string>; readonly inputContract: string;
  readonly headerNames: ReadonlyArray<string> };

const fixtureUrl = (name: string): URL => new URL(`../../evidence/issue-138-wire/${name}`, import.meta.url);
const readFixture = async <T>(name: string): Promise<T> => JSON.parse(await readFile(fixtureUrl(name), "utf8")) as T;
const bytes = (value: string): number => Buffer.byteLength(value, "utf8");
const hash = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const modelName = "jev-latest";
const sentinel = "PROVIDER_HTTP_TEST_KEY_SENTINEL";

const observe = async (id: string, local: LocalRequest, localRequestBytes: number): Promise<Observation> => {
  expect(bytes(JSON.stringify(local))).toBe(localRequestBytes);
  const decisions = Object.fromEntries(Object.entries(local.decisions).map(([key, decision]) => {
    expect(decision._tag).toBe("Probability");
    return [key, Decision.probability({ instructions: decision.instructions, criteria: decision.criteria })];
  }));
  const definition = Decision.make({ input: Schema.Json, decisions });
  const predictedBodyBytes = encodedProviderHttpBodyBytes(local.input,
    Object.entries(decisions).map(([id, decision]) => ({ id, decision })));
  const input = await Effect.runPromise(Schema.decodeUnknownEffect(Schema.Json)(local.input));
  let requestBody: string | undefined;
  let headerNames: ReadonlyArray<string> | undefined;
  const http = HttpClient.make((request) => {
    expect(request.url).toBe(DEFAULT_DESTINATION);
    expect(request.method).toBe("POST");
    expect(request.headers.authorization).toBe(`Bearer ${sentinel}`);
    expect(request.headers.accept).toBe("application/json");
    expect(request.headers["content-type"]).toContain("application/json");
    headerNames = Object.keys(request.headers).sort();
    expect(request.body._tag).toBe("Uint8Array");
    if (request.body._tag !== "Uint8Array") throw new Error("expected encoded JSON body");
    requestBody = new TextDecoder().decode(request.body.body);
    expect(request.headers["content-length"]).toBe(String(bytes(requestBody)));
    const answers = Object.fromEntries(Object.keys(decisions).map((key) => [key, { type: "noul", noul: 0.25 }]));
    return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(JSON.stringify({
      model: modelName, answers, usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 200, headers: { "content-type": "application/json" } })));
  });
  const client = TypeSafeClient.layer({ apiUrl: DEFAULT_API_BASE, apiKey: Redacted.make(sentinel) })
    .pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, http)));
  const model = TypeSafeDecisionModel.layer({ model: modelName }).pipe(Layer.provide(client));
  await Effect.runPromise(Effect.gen(function* () {
    const service = yield* DecisionModel.DecisionModel;
    yield* service.decide(definition, { input });
  }).pipe(Effect.provide(model)));
  if (requestBody === undefined) throw new Error(`no HTTP request for ${id}`);
  expect(predictedBodyBytes).toBe(bytes(requestBody));
  if (headerNames === undefined) throw new Error(`no HTTP headers for ${id}`);
  expect(requestBody).not.toContain(sentinel);
  const body = JSON.parse(requestBody) as { readonly model: string; readonly state: unknown; readonly questions: unknown };
  expect(body).toEqual({
    model: modelName,
    state: local.input,
    questions: Object.fromEntries(Object.entries(local.decisions).map(([key, decision]) =>
      [key, { type: "noul", instructions: decision.instructions, criteria: decision.criteria }])),
  });
  const contract = local.input as { readonly inputContract?: { readonly id?: string } };
  return {
    id, localRequestBytes, httpBodyBytes: bytes(requestBody), httpBodySha256: hash(requestBody),
    stateBytes: bytes(JSON.stringify(body.state)), questionsBytes: bytes(JSON.stringify(body.questions)),
    questionKeys: Object.keys(body.questions as object).sort(), inputContract: contract.inputContract?.id ?? "missing",
    headerNames,
  };
};

describe("offline provider HTTP framing for proposed #138 study arms", () => {
  it("matches escaped UTF-8, multiple keys, and both state shapes", async () => {
    const decision = { _tag: "Probability" as const, instructions: "quote \" slash \\ café 🦊",
      criteria: { false: "Non\n", true: "Oui 🦊" } };
    for (const input of [
      { artifact: { domain: "a.ts", source: "type Café = \"🦊\"" }, evidence: [],
        inputContract: { id: "direct-event-v1", evidence: "complete named direct-event unit" } },
      { inputContract: { id: "type-shape-test" }, artifact: { domain: "a.ts", source: "type Café = \"🦊\"" },
        nodes: [], edges: [] },
    ]) {
      const local = { input, decisions: { "rule-1": decision, "other.rule": decision } };
      await observe("escaped-synthetic", local, bytes(JSON.stringify(local)));
    }
  });
  it("matches pinned provider request metadata and all 35 sanitized byte observations", async () => {
    const packageJson = await readFixture<{ readonly dependencies: Readonly<Record<string, string>> }>("../../package.json");
    expect(packageJson.dependencies["@effect/ai-typesafe"]).toBe("4.0.0");
    expect(packageJson.dependencies.effect).toBe("4.0.0");
    const cases: Array<{ id: string; local: LocalRequest; localRequestBytes: number }> = [];
    for (const branch of ["type", "function"] as const) {
      const candidate = await readFixture<Candidate>(`${branch}-candidate.json`);
      cases.push({ id: `${branch}-candidate`, local: candidate.completeRequest, localRequestBytes: candidate.completeRequestBytes });
    }
    const comparators = await readFixture<Comparators>("comparators-proposal.json");
    for (const item of comparators.cases) {
      for (const armName of ["focusedDiff", "wholeFile", "v1Type"] as const) {
        const arm = item.arms[armName];
        if (arm !== undefined) cases.push({ id: `${item.id}/${armName}`, local: arm.localRequest, localRequestBytes: arm.localRequestBytes });
      }
    }
    expect(cases).toHaveLength(35);
    const observations: Array<Observation> = [];
    for (const item of cases) observations.push(await observe(item.id, item.local, item.localRequestBytes));
    const evidence = {
      schemaVersion: 1,
      status: "observed-offline-pinned-client-only",
      providerPackage: "@effect/ai-typesafe@4.0.0",
      effectPackage: "effect@4.0.0",
      endpoint: DEFAULT_DESTINATION,
      method: "POST",
      bodyFields: ["model", "state", "questions"],
      model: modelName,
      authorization: "sentinel-bearer-header-redacted",
      observations,
    };
    const target = fixtureUrl("provider-http-observations.json");
    if (process.env.UPDATE_PROVIDER_HTTP_EVIDENCE === "1") {
      await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    }
    expect(evidence).toEqual(await readFixture<typeof evidence>("provider-http-observations.json"));
    expect(observations.map((entry) => entry.id)).toEqual([...new Set(observations.map((entry) => entry.id))]);
    expect(observations.every((entry) => entry.httpBodyBytes - entry.localRequestBytes === 14)).toBe(true);
  });
});
