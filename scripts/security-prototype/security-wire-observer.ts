/** Synthetic, offline TypeSafe wire oracle shared by resident security experiments. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

// Fixture authority is intentionally independent of the production default.
const APPROVED_FIXTURE_DESTINATION = "https://api.typesafe.ai/v1/systemone";

export const securityWireManifest = JSON.parse(await readFile(
  new URL("../../src/direct-event/fixtures/security-wire-manifest.json", import.meta.url), "utf8",
)) as {
  readonly positive: {
    readonly path: string;
    readonly source: string;
    readonly root: string;
    readonly reference: string;
    readonly unrelated: ReadonlyArray<string>;
  };
};

export const securityWireRuleId = "security-probe/security_wire_probe";
export const securityWireRule = {
  id: "security_wire_probe",
  question: "Does this declaration contain the intended shape?",
  criteria: { false: "The shape is absent.", true: "The shape is present." },
  threshold: 0.7,
  message: "Prototype rule matched.",
} as const;
const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const path = securityWireManifest.positive.path;
export const securityWireExpectedBody = {
  model: "jev-latest",
  state: {
    artifact: { domain: path, source: securityWireManifest.positive.root },
    evidence: [{
      kind: "expanded",
      site: { symbol: "Branch" },
      node: {
        artifact: {
          id: `${path}:interface:Branch`, kind: "interface", name: "Branch",
          source: securityWireManifest.positive.reference,
          sourceHash: sha256(securityWireManifest.positive.reference),
        },
        references: [{
          kind: "included", site: { symbol: "Receipt" },
          target: `${path}:interface:Receipt`,
        }],
      },
    }],
    inputContract: {
      id: "direct-event/same-file-named-types/v1",
      evidence: "complete named direct-event unit",
    },
  },
  questions: {
    [securityWireRuleId]: {
      type: "noul", instructions: securityWireRule.question,
      criteria: securityWireRule.criteria,
    },
  },
};
const securityWireExpectedBytes = Buffer.from(JSON.stringify(securityWireExpectedBody), "utf8");

export type SecurityWireRecord = {
  readonly classification: "allowed" | "forbidden";
  readonly method: string;
  readonly url: string;
  readonly bodySha256: string;
  readonly bodyBytes: number;
  readonly headers: {
    readonly names: ReadonlyArray<string>;
    readonly authorization: "synthetic-bearer" | "unexpected";
    readonly accept: string | undefined;
    readonly contentType: string | undefined;
  };
};

/** Captures every TypeSafe HTTP request before a deterministic 200 response. No network client is available. */
export const makeOfflineSecurityHttpClient = (
  onRequest: (record: SecurityWireRecord) => void,
): HttpClient.HttpClient => HttpClient.make((request) => {
  const bodyBytes = request.body._tag === "Uint8Array"
    ? Buffer.from(request.body.body)
    : Buffer.alloc(0);
  const body = bodyBytes.toString("utf8");
  const headers = request.headers;
  const headerNames = Object.keys(headers).sort();
  let parsedBody: unknown;
  try { parsedBody = JSON.parse(body); } catch { parsedBody = undefined; }
  const classification =
    request.method === "POST" &&
    request.url === APPROVED_FIXTURE_DESTINATION &&
    JSON.stringify(headerNames) === JSON.stringify(["accept", "authorization", "b3", "content-length", "content-type", "traceparent"]) &&
    headers.authorization === "Bearer WIRE_KEY_SENTINEL" &&
    headers.accept === "application/json" &&
    headers["content-type"]?.includes("application/json") &&
    headers["content-length"] === String(bodyBytes.length) &&
    /^[a-f0-9-]+$/.test(headers.b3 ?? "") &&
    /^00-[a-f0-9]{32}-[a-f0-9]{16}-[0-9a-f]{2}$/.test(headers.traceparent ?? "") &&
    parsedBody !== undefined && bodyBytes.equals(securityWireExpectedBytes) &&
    securityWireManifest.positive.unrelated.every((marker) => !body.includes(marker)) &&
    !body.includes("WIRE_KEY_SENTINEL")
      ? "allowed" as const : "forbidden" as const;
  onRequest({
    classification, method: request.method, url: request.url,
    bodySha256: sha256(bodyBytes), bodyBytes: bodyBytes.length,
    headers: {
      names: headerNames,
      authorization: headers.authorization === "Bearer WIRE_KEY_SENTINEL" ? "synthetic-bearer" : "unexpected",
      accept: headers.accept, contentType: headers["content-type"],
    },
  });
  return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(JSON.stringify({
    model: "jev-latest",
    answers: { [securityWireRuleId]: { type: "noul", noul: 0.25 } },
    usage: { input_tokens: 1, output_tokens: 1 },
  }), { status: 200, headers: { "content-type": "application/json" } })));
});
