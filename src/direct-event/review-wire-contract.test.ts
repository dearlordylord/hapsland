import { bundledBendArtifact } from "@hapsland/source-analysis/direct-event/languages/bend/bundled-evidence"
import { providerIdentity } from "@hapsland/review-definition/review-providers/catalog"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { compileRule } from "@hapsland/review-definition/rules/compiler"
import { FUNCTION_INPUT_CONTRACT, TYPE_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import {
  canonicalValue,
  freezeRules,
  semanticIdentity,
  type PreparedUnit
} from "@hapsland/review-definition/direct-event/model"
import {
  bundledArtifactDomain,
  type ReviewArtifact,
  type ReviewNode
} from "@hapsland/source-artifacts/direct-event/artifact-model"
import {
  candidateReviewInput,
  encodedFullJevRequestBytes,
  encodedPreparedProviderInputBytes,
  preparedProviderInput
} from "@hapsland/review-execution/direct-event/pipeline"
import {
  CANDIDATE_RENDERER_DIGEST,
  CANDIDATE_RENDERER_VERSION,
  MAX_CANDIDATE_TREE_BYTES,
  renderCandidateReviewInput
} from "@hapsland/review-execution/direct-event/review-renderer"

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
  new URL(`../test-support/fixtures/issue-138-wire/${branch}-candidate.json`, import.meta.url)

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
  it("rejects candidate roots whose identity, path, or contract does not match the prepared declaration", () => {
    const unit = prepared("type")
    const root = unit.input.unit.root
    const bundledOrigin = bundledBendArtifact("List")?.origin
    if (bundledOrigin === undefined) throw new Error("pinned Base.List provenance unavailable")
    const { path: _path, ...rootWithoutPath } = root.artifact
    const invalidInputs = [
      { ...unit.input, candidateProjection: false },
      { ...unit.input, contract: "direct-event/unknown/v1" },
      { ...unit.input, unit: { root: node({ ...root.artifact, origin: bundledOrigin }, root.references) } },
      { ...unit.input, unit: { root: node(rootWithoutPath, root.references) } },
      { ...unit.input, unit: { root: node({ ...root.artifact, path: "src/elsewhere.ts" }, root.references) } },
      { ...unit.input, unit: { root: node({ ...root.artifact, id: "src/order.ts:interface:Other" }, root.references) } }
    ]
    for (const input of invalidInputs) {
      const failures: unknown[] = []
      expect(candidateReviewInput(input, (failure) => failures.push(failure))).toBeUndefined()
      expect(failures).toEqual([{ code: "review-input-invalid", args: { reason: "root-invalid" } }])
    }
  })

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

describe("bundled Bend provider evidence", () => {
  const libraryUnit = (): PreparedUnit => {
    const unit = prepared("type")
    const library = bundledBendArtifact("List")
    if (library === undefined) throw new Error("pinned Base.List evidence unavailable")
    const root = unit.input.unit.root.artifact
    return {
      ...unit,
      input: {
        ...unit.input,
        unit: { root: node(root, [{ kind: "expanded", site: { symbol: "List" }, node: node(library) }]) }
      }
    }
  }

  it("renders actual compiler bytes and explicit provenance without a project path", () => {
    const unit = libraryUnit()
    const library = bundledBendArtifact("List")!
    const candidate = candidateReviewInput(unit.input)
    const rendered = preparedProviderInput(unit)
    expect(candidate?.nodes[0]).toMatchObject({
      id: library.id,
      source: library.source,
      origin: library.origin,
      domain: bundledArtifactDomain(library.origin!)
    })
    expect(rendered?.evidence.nodes[0]).toEqual(candidate?.nodes[0])
    expect(library.path).toBeUndefined()
    expect(candidate?.artifact.domain).toBe(unit.input.path)
    expect(JSON.stringify(rendered)).toContain(library.source.replaceAll("\n", "\\n"))
  })

  it("rejects forged provenance, mismatched bytes, fake project paths and bundled roots", () => {
    const unit = libraryUnit()
    const candidate = candidateReviewInput(unit.input)!
    const library = candidate.nodes[0]!
    for (const changed of [
      { ...library, source: `${library.source}\n` },
      { ...library, domain: "Base.bend" },
      { ...library, origin: { ...library.origin, declarationHash: "0".repeat(64) } },
      { ...library, origin: { ...library.origin, compilerSource: "forged" } },
      { ...library, origin: { ...library.origin, extra: true } },
      { ...library, origin: undefined }
    ])
      expect(renderCandidateReviewInput({ ...candidate, nodes: [changed] })).toBeUndefined()
    expect(renderCandidateReviewInput({ ...candidate, artifact: library, nodes: [] })).toBeUndefined()
    const support = unit.input.unit.root.references[0]!
    if (support.kind !== "expanded") throw new Error("missing library support")
    const forged = { ...support.node.artifact, path: "Base.bend" }
    expect(
      candidateReviewInput({
        ...unit.input,
        unit: { root: node(unit.input.declaration, [{ ...support, node: node(forged) }]) }
      })
    ).toBeUndefined()
  })

  it("keeps a project List distinct from compiler List", () => {
    const unit = libraryUnit()
    const reference = unit.input.unit.root.references[0]!
    const project = artifact("src/List.bend", "datatype", "List", "type List is Data:\n  Empty{}")
    const input = {
      ...unit.input,
      unit: {
        root: node(unit.input.declaration, [
          reference,
          { kind: "expanded" as const, site: { symbol: "Project.List" }, node: node(project) }
        ])
      }
    }
    const candidate = candidateReviewInput(input)
    const rendered = candidate === undefined ? undefined : renderCandidateReviewInput(candidate)
    expect(rendered?.evidence.nodes.map(({ id }) => id)).toEqual([bundledBendArtifact("List")!.id, project.id])
    expect(rendered?.evidence.nodes[1]?.origin).toBeUndefined()
  })

  it("keeps bundle provenance and bytes in semantic reuse identity", () => {
    const unit = libraryUnit()
    const before = semanticIdentity(unit.input)
    const support = unit.input.unit.root.references[0]!
    if (support.kind !== "expanded") throw new Error("missing support")
    for (const artifact of [
      { ...support.node.artifact, source: `${support.node.artifact.source}\n` },
      { ...support.node.artifact, origin: { ...support.node.artifact.origin!, compilerSource: "changed" } }
    ]) {
      const changed = {
        ...unit.input,
        unit: { root: node(unit.input.declaration, [{ ...support, node: node(artifact) }]) }
      }
      expect(semanticIdentity(changed)).not.toBe(before)
    }
  })
})
