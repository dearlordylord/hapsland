/** Throwaway security wire prototype: independent fixture oracle against the installed provider. */
import { describe, expect, it } from "@effect/vitest";
import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { compileRules } from "../rules/compiler.ts";
import { decodeRulePackDocument } from "../rules/schema.ts";
import { Consent } from "../runtime/consent.ts";
import { DEFAULT_API_BASE, DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import { adaptCodexAdd } from "./adapter.ts";
import { prepareObservation, evaluatePrepared } from "./pipeline.ts";
import { makeGitFixture, put, updateEvent } from "./test-fixtures.ts";

type Manifest = {
  readonly positive: { readonly path: string; readonly source: string; readonly root: string; readonly reference: string; readonly unrelated: ReadonlyArray<string> };
  readonly unsupported: { readonly path: string; readonly source: string };
  readonly excluded: { readonly path: string; readonly source: string };
};

const manifest = JSON.parse(await readFile(new URL("./fixtures/security-wire-manifest.json", import.meta.url), "utf8")) as Manifest;
const digest = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const oracleRule = {
  id: "security_wire_probe",
  question: "Does this declaration contain the intended shape?",
  criteria: { false: "The shape is absent.", true: "The shape is present." },
  threshold: 0.7,
  message: "Prototype rule matched.",
} as const;
const pack = decodeRulePackDocument({ schemaVersion: 1, id: "security-probe", contentVersion: "1", rules: [oracleRule] }, "fixture:security-wire");
const rules = compileRules({ packs: [{ ...pack, path: "fixture:security-wire", enabled: true, origin: { layer: "built-in", source: "fixture:security-wire", field: "rules" } }] });
const ruleId = "security-probe/security_wire_probe";

type WireRequest = { readonly url: string; readonly method: string; readonly headers: Readonly<Record<string, string>>; readonly body: string };

const recordingModel = (requests: Array<WireRequest>) => {
  const http = HttpClient.make((request) => {
    const body = request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "";
    requests.push({ url: request.url, method: request.method, headers: request.headers, body });
    return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(JSON.stringify({
      model: "jev-latest",
      answers: { [ruleId]: { type: "noul", noul: 0.25 } },
      usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 200, headers: { "content-type": "application/json" } })));
  });
  const client = TypeSafeClient.layer({ apiUrl: DEFAULT_API_BASE, apiKey: Redacted.make("WIRE_KEY_SENTINEL") })
    .pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, http)));
  return TypeSafeDecisionModel.layer({ model: "jev-latest" }).pipe(Layer.provide(client));
};

const prepare = (root: string, path: string, source: string, reads: Array<string>, policy?: { includes: string[]; excludes: string[] }) =>
  Effect.gen(function* () {
    yield* Effect.promise(() => put(root, path, source));
    const changedLine = source.split("\n").find((line) => line.includes("interface "));
    if (changedLine === undefined) throw new Error("fixture has no interface update line");
    const observation = yield* adaptCodexAdd(updateEvent(root, path, [changedLine]));
    expect(observation).toBeDefined();
    if (observation === undefined) throw new Error("fixture adaptation failed");
    const consent = yield* Consent.Service;
    const proposal = yield* consent.preview(root, DEFAULT_BACKEND, DEFAULT_DESTINATION);
    yield* consent.enable(proposal);
    return yield* prepareObservation(observation, {
      controlledWriter: true,
      advicee: observation.advicee,
      consent,
      settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
      ...(policy === undefined ? {} : { policy }),
      rules,
      captureHooks: { sourceRead: () => { reads.push(path); } },
    });
  }).pipe(Effect.provide(Consent.testLayer()));

describe("security wire prototype", () => {
  it.effect("sends exactly the selected declaration, reachable reference, rule, and transport fields", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      const reads: Array<string> = [];
      const requests: Array<WireRequest> = [];
      const prepared = yield* prepare(root, manifest.positive.path, manifest.positive.source, reads);
      expect(reads).toEqual([manifest.positive.path, manifest.positive.path]);
      const ready = prepared.outcomes.filter((item) => item.status === "ready");
      expect(ready).toHaveLength(1);
      const unit = ready[0];
      if (unit?.status !== "ready") throw new Error("expected selected root");
      expect(unit.prepared.input.declaration.name).toBe("Receipt");
      const evaluated = yield* evaluatePrepared(unit.prepared).pipe(Effect.provide(recordingModel(requests)));
      expect(evaluated.status).toBe("evaluated");
      expect(requests).toHaveLength(1);
      const request = requests[0];
      if (request === undefined) throw new Error("missing wire request");
      expect(request.url).toBe(DEFAULT_DESTINATION);
      expect(request.method).toBe("POST");
      expect(request.headers.authorization).toBe("Bearer WIRE_KEY_SENTINEL");
      expect(request.headers.accept).toBe("application/json");
      expect(request.headers["content-type"]).toContain("application/json");
      expect(JSON.parse(request.body)).toEqual({
        model: "jev-latest",
        state: {
          artifact: { domain: manifest.positive.path, source: manifest.positive.root },
          evidence: [{
            kind: "expanded",
            site: { symbol: "Branch" },
            node: {
              artifact: {
                id: `${manifest.positive.path}:interface:Branch`, kind: "interface", name: "Branch",
                source: manifest.positive.reference, sourceHash: digest(manifest.positive.reference),
              },
              references: [{
                kind: "included", site: { symbol: "Receipt" }, target: `${manifest.positive.path}:interface:Receipt`,
              }],
            },
          }],
          inputContract: { id: "direct-event/same-file-named-types/v1", evidence: "complete named direct-event unit" },
        },
        questions: {
          [ruleId]: { type: "noul", instructions: oracleRule.question, criteria: oracleRule.criteria },
        },
      });
      for (const marker of manifest.positive.unrelated) expect(request.body).not.toContain(marker);
      expect(request.body).not.toContain(root);
      expect(request.body).not.toContain("WIRE_KEY_SENTINEL");
    }), 20_000,
  );

  it.effect("does not read or submit an excluded file", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      const reads: Array<string> = [];
      const requests: Array<WireRequest> = [];
      const prepared = yield* prepare(root, manifest.excluded.path, manifest.excluded.source, reads, {
        includes: ["**/*"], excludes: [manifest.excluded.path],
      });
      for (const outcome of prepared.outcomes) if (outcome.status === "ready") yield* evaluatePrepared(outcome.prepared).pipe(Effect.provide(recordingModel(requests)));
      expect(prepared.outcomes).toEqual([{ status: "skipped", path: manifest.excluded.path }]);
      expect(reads).toEqual([]);
      expect(requests).toEqual([]);
    }), 20_000,
  );

  it.effect("reads but never submits an unresolved root", () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(makeGitFixture);
      const reads: Array<string> = [];
      const requests: Array<WireRequest> = [];
      const prepared = yield* prepare(root, manifest.unsupported.path, manifest.unsupported.source, reads);
      for (const outcome of prepared.outcomes) if (outcome.status === "ready") yield* evaluatePrepared(outcome.prepared).pipe(Effect.provide(recordingModel(requests)));
      expect(reads).toEqual([manifest.unsupported.path, manifest.unsupported.path]);
      expect(prepared.outcomes).toEqual([{ status: "skipped", path: manifest.unsupported.path }]);
      expect(requests).toEqual([]);
    }), 20_000,
  );
});
