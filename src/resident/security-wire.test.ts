import { describe, expect, it } from "vitest"
import { execFileSync } from "../../scripts/test-harness/process.mjs"
import { fileURLToPath } from "node:url"
import * as Effect from "effect/Effect"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import {
  makeOfflineSecurityHttpClient,
  securityWireExpectedBody
} from "../../scripts/security-prototype/security-wire-observer.ts"

const witness = fileURLToPath(new URL("../../scripts/security-prototype/resident-wire.mjs", import.meta.url))
const processWitness = fileURLToPath(
  new URL("../../scripts/security-prototype/resident-wire-process.mjs", import.meta.url)
)

describe("launched resident wire witness", () => {
  for (const [scenario, expectedRequests, expectedPreparation] of [
    ["allowed", 1, true],
    ["exclude-at-dispatch", 0, true],
    ["exclude-at-admission", 0, false]
  ] as const) {
    for (const [profile, executable] of [
      ["same-process", witness],
      ["distinct-process", processWitness]
    ] as const) {
      it(`${scenario} (${profile})`, () => {
        const output = execFileSync(
          process.execPath,
          ["--experimental-strip-types", executable, "--scenario", scenario],
          { encoding: "utf8", timeout: 30_000 }
        )
        const journal = JSON.parse(output) as {
          version: number
          verdict: string
          events: Array<{ kind: string; classification?: string }>
          requests: Array<{ classification: string }>
        }
        expect(journal.version).toBe(1)
        expect(journal.verdict).toBe("pass")
        expect(journal.events.some((event) => event.kind === "prepared")).toBe(expectedPreparation)
        expect(journal.events.at(-1)?.kind).toBe("settled")
        expect(journal.requests).toHaveLength(expectedRequests)
        expect(journal.requests.every((request) => request.classification === "allowed")).toBe(true)
        expect(output).not.toContain("CAFÉ_VALUE")
        expect(output).not.toContain("WIRE_KEY_SENTINEL")
      })
    }
  }
})

it("compares encoded body bytes before UTF-8 decoding can hide a BOM", async () => {
  const expected = Buffer.from(JSON.stringify(securityWireExpectedBody), "utf8")
  const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), expected])
  const records: Array<{ classification: string; bodyBytes: number; bodySha256: string }> = []
  const client = makeOfflineSecurityHttpClient((record) => records.push(record))
  const request = (bytes: Buffer) =>
    HttpClientRequest.bodyUint8Array(
      HttpClientRequest.setHeaders(HttpClientRequest.post("https://api.typesafe.ai/v1/systemone"), {
        accept: "application/json",
        authorization: "Bearer WIRE_KEY_SENTINEL",
        b3: "abc",
        traceparent: `00-${"a".repeat(32)}-${"b".repeat(16)}-01`,
        "content-length": String(bytes.length)
      }),
      bytes,
      "application/json"
    )
  await Effect.runPromise(client.execute(request(expected)))
  await Effect.runPromise(client.execute(request(withBom)))
  expect(records.map((record) => record.classification)).toEqual(["allowed", "forbidden"])
  expect(records.map((record) => record.bodyBytes)).toEqual([expected.length, withBom.length])
  expect(records[0]?.bodySha256).not.toBe(records[1]?.bodySha256)
})
