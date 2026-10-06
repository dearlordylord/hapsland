import { providerIdentity } from "../review-providers/catalog.ts"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { compileRule } from "../rules/compiler.ts"
import { FUNCTION_INPUT_CONTRACT, TYPE_INPUT_CONTRACT } from "../rules/targets.ts"
import { canonicalValue, freezeRules, type PreparedUnit } from "./model.ts"
import type { ReviewArtifact, ReviewNode } from "./artifact-model.ts"
import {
  candidateReviewInput,
  encodedFullJevRequestBytes,
  encodedPreparedProviderInputBytes,
  preparedProviderInput
} from "./pipeline.ts"
import {
  CANDIDATE_RENDERER_DIGEST,
  CANDIDATE_RENDERER_VERSION,
  MAX_CANDIDATE_TREE_BYTES,
  renderCandidateReviewInput
} from "./review-renderer.ts"

const hash = (source: string): string => createHash("sha256").update(source, "utf8").digest("hex")
const artifact = (path: string, kind: ReviewArtifact["kind"], name: string, source: string): ReviewArtifact => ({
  path,
  id: `${path}:${kind}:${name}`,
  kind,
  name,
  source,
  sourceHash: hash(source)
})
const node = (value: ReviewArtifact, references: ReviewNode["references"] = []): ReviewNode => ({
  artifact: value,
  references
})
const rules = [
  {
    id: "type",
    question: "Is the selected type closure meaningful?",
    criteria: { false: "No", true: "Yes" },
    message: "Review the type closure",
    inputs: [
      {
        languages: ["typescript", "rust", "bend"],
        kind: "type",

        requires: ["root-declaration", "resolved-outbound-types"]
      }
    ]
  },
  {
    id: "function",
    question: "Does the selected function call its helper?",
    criteria: { false: "No", true: "Yes" },
    message: "Review the function body",
    inputs: [
      {
        languages: ["typescript"],
        kind: "function",

        requires: ["signature", "body", "resolved-local-calls"]
      }
    ]
  }
].map((rule) => compileRule({ version: 1, ...rule }, "fixture:issue-138-wire"))

const prepared = (branch: "type" | "function"): PreparedUnit => {
  const isType = branch === "type"
  const path = isType ? "src/order.ts" : "src/checkout.ts"
  const supportPath = isType ? "src/amount.ts" : "src/helper.ts"
  const root = isType
    ? artifact(path, "interface", "Order", "export interface Order { amount: Amount }")
    : artifact(path, "function", "checkout", "export function checkout(value: number): number { return double(value) }")
  const support = isType
    ? artifact(supportPath, "type-alias", "Amount", "export type Amount = number")
    : artifact(supportPath, "function", "double", "export function double(value: number): number { return value * 2 }")
  const supportNode = node(support)
  const rootNode = node(root, [{ kind: "expanded", site: { symbol: isType ? "Amount" : "double" }, node: supportNode }])
  const rule = rules[isType ? 0 : 1]
  if (rule === undefined) throw new Error("missing proposed fixture rule")
  const contract = isType ? TYPE_INPUT_CONTRACT : FUNCTION_INPUT_CONTRACT
  return {
    root: "/fixture",
    identity: `wire-${branch}`,
    advicee: {
      host: "codex-cli",
      hostVersion: "0.155.1",
      sessionId: "s",
      turnId: "t",
      toolUseId: "u",
      subagentId: null
    },
    input: {
      providerIdentity: providerIdentity({ provider: "jev" }),
      contract,
      candidateProjection: true,
      completeness: "complete",
      path,
      declaration: root,
      unit: { root: rootNode },
      rules: freezeRules([rule], {
        language: "typescript",
        artifactKind: isType ? "typeShape" : "function",
        inputContract: contract
      }),
      interpretation: "probability-strictly-greater-than-threshold"
    }
  }
}

const goldenUrl = (branch: "type" | "function"): URL =>
  new URL(`../../evidence/issue-138-wire/${branch}-candidate.json`, import.meta.url)

const wireRecord = (unit: PreparedUnit) => {
  const candidate = candidateReviewInput(unit.input)
  const input = preparedProviderInput(unit)
  if (candidate === undefined || input === undefined) throw new Error("fixture did not render")
  const completeRequest = {
    input,
    decisions: Object.fromEntries(unit.input.rules.map(({ id, decision }) => [id, decision]))
  }
  const { inputContract: _contract, ...tree } = input
  return {
    providerInput: input,
    completeRequest,
    canonicalTreeBytes: Buffer.byteLength(canonicalValue(tree), "utf8"),
    providerInputBytes: encodedPreparedProviderInputBytes(unit),
    completeRequestBytes: encodedFullJevRequestBytes(unit)
  }
}

// An explicit maintenance switch regenerates proposed fixtures after reviewed renderer/rule changes.
for (const branch of ["type", "function"] as const) {
  describe(`${branch} candidate Jev wire proposal`, () => {
    it("matches the checked-in golden and bounded evidence input", async () => {
      const unit = prepared(branch)
      const actual = wireRecord(unit)
      if (process.env.UPDATE_WIRE_GOLDENS === "1") {
        await writeFile(goldenUrl(branch), `${JSON.stringify(actual, null, 2)}\n`, "utf8")
      }
      const golden = JSON.parse(await readFile(goldenUrl(branch), "utf8")) as typeof actual
      expect(actual).toEqual(golden)
      expect(Buffer.byteLength(JSON.stringify(actual.providerInput), "utf8")).toBe(actual.providerInputBytes)
      expect(Buffer.byteLength(JSON.stringify(actual.completeRequest), "utf8")).toBe(actual.completeRequestBytes)
      expect(actual.providerInputBytes).toBeLessThanOrEqual(MAX_CANDIDATE_TREE_BYTES)
      expect(actual.providerInput.inputContract).toMatchObject({
        id: unit.input.contract,
        completeness: "complete",
        rendererVersion: CANDIDATE_RENDERER_VERSION,
        rendererDigest: CANDIDATE_RENDERER_DIGEST
      })
      if (!("projectionFingerprint" in actual.providerInput.inputContract)) {
        throw new Error("candidate renderer did not supply its projection fingerprint")
      }
      const { inputContract: _contract, ...tree } = actual.providerInput
      expect(Buffer.byteLength(canonicalValue(tree), "utf8")).toBe(actual.canonicalTreeBytes)
      expect(actual.providerInput.inputContract.projectionFingerprint).toBe(hash(canonicalValue(tree)))
      expect(JSON.stringify(actual.completeRequest)).not.toContain("/fixture")
    })
  })
}

describe("candidate wire no-send cases", () => {
  it("rejects absolute paths, incomplete graph, extra source, and a tree over the finite bound", () => {
    const unit = prepared("type")
    const candidate = candidateReviewInput(unit.input)
    expect(candidate).toBeDefined()
    if (candidate === undefined) throw new Error("missing candidate")
    expect(
      renderCandidateReviewInput({
        ...candidate,
        artifact: { ...candidate.artifact, id: "/private/order.ts:interface:Order", domain: "/private/order.ts" }
      })
    ).toBeUndefined()
    expect(renderCandidateReviewInput({ ...candidate, edges: [] })).toBeUndefined()
    expect(
      renderCandidateReviewInput({
        ...candidate,
        nodes: [
          ...candidate.nodes,
          {
            id: "src/private.ts:type-alias:Private",
            kind: "type-alias",
            name: "Private",
            domain: "src/private.ts",
            source: "type Private = 'unrelated source'",
            order: 1
          }
        ]
      })
    ).toBeUndefined()
    expect(
      renderCandidateReviewInput({
        ...candidate,
        nodes: [{ ...candidate.nodes[0]!, id: "../private.ts:type-alias:Amount", domain: "../private.ts" }]
      })
    ).toBeUndefined()
    expect(
      renderCandidateReviewInput({ ...candidate, artifact: { ...candidate.artifact, patch: "private diff" } })
    ).toBeUndefined()
    expect(
      renderCandidateReviewInput({
        ...candidate,
        artifact: { ...candidate.artifact, source: "x".repeat(MAX_CANDIDATE_TREE_BYTES) }
      })
    ).toBeUndefined()
    const absolutePathUnit = {
      ...unit,
      input: {
        ...unit.input,
        path: "/private/order.ts",
        declaration: { ...unit.input.declaration, path: "/private/order.ts" },
        unit: {
          root: {
            ...unit.input.unit.root,
            artifact: {
              ...unit.input.unit.root.artifact,
              path: "/private/order.ts",
              id: "/private/order.ts:interface:Order"
            }
          }
        }
      }
    }
    expect(preparedProviderInput(absolutePathUnit)).toBeUndefined()
    expect(encodedFullJevRequestBytes(absolutePathUnit)).toBe(Number.POSITIVE_INFINITY)
  })
})
