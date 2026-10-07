import { describe, expect, it } from "vitest"
import {
  decodeCurrentResidentRequest,
  decodeResidentRequest,
  encodeCurrentResidentRequest
} from "@hapsland/resident-transport/resident/protocol"
import { requestConformanceCases } from "@hapsland/build-tooling/test-support/resident-request-conformance"

const decode = (value: unknown) => decodeResidentRequest(JSON.stringify(value))
const admission = requestConformanceCases.find((request) => request.operation === "admit")
if (admission?.operation !== "admit") throw new Error("missing admission fixture")
const requiredPaths = (value: unknown, prefix: string[] = []): string[][] => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return []
  return Object.entries(value).flatMap(([key, entry]) => [[...prefix, key], ...requiredPaths(entry, [...prefix, key])])
}

describe("exact resident request alternatives", () => {
  for (const [index, request] of requestConformanceCases.entries()) {
    it(`accepts ${request.operation} alternative ${index} and rejects other routes/excess fields`, () => {
      expect(decode(request)).toEqual(request)
      expect(decodeCurrentResidentRequest(encodeCurrentResidentRequest(request))).toEqual(request)
      const optional =
        request.operation === "prompt-marker"
          ? ["promptDigest", "onlyIfMissing"]
          : request.operation === "begin-stop" || request.operation === "finish-stop"
            ? ["close", "reason"]
            : request.operation === "register-edit"
              ? ["activityPath", "userConfigPath"]
              : request.operation === "collect"
                ? ["reportWorkState", ...(request.mode === "turn-end" ? [] : ["mode"])]
                : []
      for (const key of Object.keys(request).filter((key) => !optional.includes(key))) {
        const missing = { ...request }
        Reflect.deleteProperty(missing, key)
        expect(decode(missing), `missing ${key}`).toBeUndefined()
      }
      expect(
        decode({ ...request, requestRoute: request.requestRoute === "shared" ? "edit" : "shared" })
      ).toBeUndefined()
      for (const field of ["extra", "version", "ticket", "ticketed"]) {
        expect(decode({ ...request, [field]: true })).toBeUndefined()
      }
      const wire = JSON.parse(encodeCurrentResidentRequest(request))
      for (const field of ["extra", "ticket", "ticketed", "requestRoute"]) {
        expect(decodeCurrentResidentRequest(JSON.stringify({ ...wire, [field]: true }))).toBeUndefined()
      }
    })
  }
  it("rejects missing required fields and recursively rejects unknown fields", () => {
    // Minimal alternatives contain required fields only.
    for (const request of requestConformanceCases.filter(
      (request) => !["prompt-marker", "finish-stop", "register-edit", "collect"].includes(request.operation)
    )) {
      for (const key of Object.keys(request)) {
        const copy = { ...request }
        Reflect.deleteProperty(copy, key)
        expect(decode(copy), `${request.operation}.${key}`).toBeUndefined()
      }
    }
    for (const path of requiredPaths(admission).filter((path) => path.at(-1) !== "controlled")) {
      const copy = JSON.parse(JSON.stringify(admission))
      let target = copy
      for (const key of path.slice(0, -1)) target = target[key]
      const key = path.at(-1)
      if (key === undefined) throw new Error("empty field path")
      Reflect.deleteProperty(target, key)
      expect(decode(copy), path.join(".")).toBeUndefined()
    }
    for (const field of ["observation", "dispatch"]) {
      const value = admission[field as "observation" | "dispatch"]
      expect(decode({ ...admission, [field]: { ...value, unknown: true } })).toBeUndefined()
    }
    expect(
      decode({
        ...admission,
        observation: { ...admission.observation, advicee: { ...admission.observation.advicee, extra: true } }
      })
    ).toBeUndefined()
    expect(decode({ ...admission, dispatch: { ...admission.dispatch, controlled: { extra: true } } })).toBeUndefined()
  })
  it("enforces observation collections, paths, host identities and field bounds", () => {
    const observation = admission.observation
    for (const candidates of [
      [],
      Array(17).fill(observation.candidates[0]),
      [{ operation: "update", path: "type.ts" }],
      [{ operation: "delete", path: "type.ts", addedLines: ["line"] }],
      [{ operation: "move", path: "type.ts", addedLines: [], extra: true }],
      [{ operation: "add", path: "type.ts", addedLines: Array(65_537).fill("") }]
    ]) {
      expect(decode({ ...admission, observation: { ...observation, candidates } })).toBeUndefined()
    }
    for (const candidates of [
      [{ operation: "update", path: "type.ts", addedLines: [] }],
      [{ operation: "delete", path: "type.ts", addedLines: [] }],
      [{ operation: "move", path: "type.ts", addedLines: [] }],
      Array(16).fill(observation.candidates[0]),
      [{ operation: "add", path: "type.ts", addedLines: Array(65_536).fill("") }]
    ]) {
      expect(decode({ ...admission, observation: { ...observation, candidates } })).toBeDefined()
    }
    for (const lifetime of ["", "a".repeat(16_385), 1, null]) expect(decode({ ...admission, lifetime })).toBeUndefined()
    expect(decode({ ...admission, lifetime: "a".repeat(16_384) })).toBeDefined()
    expect(decode({ ...admission, observation: { ...observation, nativePatchCommand: 1 } })).toBeUndefined()
    expect(decode({ ...admission, observation: { ...observation, nativePatchCommand: "patch" } })).toBeDefined()
  })
  it("retains only supported runtime identities and the Claude edit route", () => {
    const observation = admission.observation
    const identity = observation.advicee
    for (const hostVersion of ["0.155.1", "0.156.0", "0.160.0", "0.161.0"]) {
      expect(
        decode({ ...admission, observation: { ...observation, advicee: { ...identity, hostVersion } } })
      ).toBeDefined()
    }
    for (const change of [
      { hostVersion: "invalid" },
      { host: "opencode", hostVersion: "1.14.44", turnId: null },
      { turnId: null },
      { host: "claude-code", hostVersion: "2.1.218", turnId: "turn" }
    ]) {
      expect(
        decode({ ...admission, observation: { ...observation, advicee: { ...identity, ...change } } })
      ).toBeUndefined()
    }
    expect(decode({ ...admission, requestRoute: "edit", operation: "admit-and-collect", waitMs: 1 })).toBeUndefined()
    const claude = {
      ...admission,
      observation: {
        ...observation,
        advicee: { ...identity, host: "claude-code", hostVersion: "2.1.218", turnId: null }
      }
    }
    expect(decode(claude)).toBeDefined()
    for (const waitMs of [0, 3_900])
      expect(decode({ ...claude, requestRoute: "edit", operation: "admit-and-collect", waitMs })).toBeDefined()
    for (const waitMs of [-1, 3_901, 1.5])
      expect(decode({ ...claude, requestRoute: "edit", operation: "admit-and-collect", waitMs })).toBeUndefined()
  })
  it("validates credential byte bounds/generations and exact controlled dispatch", () => {
    const credential = {
      name: "API_KEY",
      environmentValue: "é".repeat(16_384),

      generation: Number.MAX_SAFE_INTEGER,
      statePath: "/tmp/state"
    }
    const dispatch = { ...admission.dispatch, credential }
    expect(decode({ ...admission, dispatch })).toBeDefined()
    for (const change of [
      { name: "bad-key" },
      { generation: -1 },
      { generation: 0.5 },
      { generation: Number.MAX_SAFE_INTEGER + 1 },
      { environmentValue: credential.environmentValue + "a" },
      { statePath: "relative" },
      { extra: true }
    ]) {
      expect(
        decode({ ...admission, dispatch: { ...dispatch, credential: { ...credential, ...change } } })
      ).toBeUndefined()
    }
    for (const change of [
      { statePath: "relative" },
      { userConfigPath: "" },
      { activityPath: "relative" },
      { sessionAnalytics: 1 },
      { controlled: { delayMs: -1 } },
      { controlled: { answers: [] } }
    ]) {
      expect(decode({ ...admission, dispatch: { ...admission.dispatch, ...change } })).toBeUndefined()
    }
  })
  it("validates verified hunk shape, bounded coordinates and matching paths", () => {
    const hunk = {
      path: "type.ts",
      verified: true,
      location: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } }
    }
    const verified = { path: "type.ts", contentHash: "a".repeat(64), hunks: [hunk] }
    const withHunks = (verifiedPostEditHunks: unknown) =>
      decode({ ...admission, observation: { ...admission.observation, verifiedPostEditHunks } })
    expect(withHunks(verified)).toBeDefined()
    expect(withHunks({ ...verified, hunks: Array(64).fill(hunk) })).toBeDefined()
    for (const hunks of [
      [],
      Array(65).fill(hunk),
      [{ ...hunk, path: "other.ts" }],
      [{ ...hunk, verified: false }],
      [{ ...hunk, extra: 1 }],
      [{ ...hunk, location: { ...hunk.location, extra: true } }],
      [{ ...hunk, location: { ...hunk.location, start: { line: 1, column: 1, extra: true } } }],
      [{ ...hunk, location: { ...hunk.location, start: { line: 0, column: 1 } } }]
    ]) {
      expect(withHunks({ ...verified, hunks })).toBeUndefined()
    }
    expect(withHunks({ ...verified, contentHash: "bad" })).toBeUndefined()
  })
})
