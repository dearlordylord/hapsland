import { describe, expect, it } from "vitest"
import {
  CANDIDATE_RENDERER_DIGEST,
  CANDIDATE_RENDERER_VERSION,
  renderCandidateReviewInput,
  type CandidateReviewInput
} from "./review-renderer.ts"

const fixture = (): CandidateReviewInput => ({
  contract: "direct-event/type-shape/v1",
  completeness: "complete",
  treeBytesLimit: 20 * 1024,
  artifact: {
    id: "src/a.ts:interface:A",
    kind: "interface",
    name: "A",
    domain: "src/a.ts",
    source: "interface A { b: B }"
  },
  nodes: [
    {
      id: "src/c.ts:type-alias:C",
      kind: "type-alias",
      name: "C",
      domain: "src/c.ts",
      source: "type C = string",
      order: 2
    },
    {
      id: "src/b.ts:interface:B",
      kind: "interface",
      name: "B",
      domain: "src/b.ts",
      source: "interface B { c: C }",
      order: 1
    }
  ],
  edges: [
    { from: "src/b.ts:interface:B", to: "src/c.ts:type-alias:C", kind: "expanded", symbol: "C", order: 2 },
    { from: "src/a.ts:interface:A", to: "src/b.ts:interface:B", kind: "expanded", symbol: "B", order: 1 }
  ]
})

describe("candidate review input renderer", () => {
  it("renders ordered complete evidence with stable version and fingerprint", () => {
    const input = fixture()
    const rendered = renderCandidateReviewInput(input)
    expect(rendered).toBeDefined()
    expect(rendered?.artifact).toEqual({
      kind: "interface",
      name: "A",
      domain: "src/a.ts",
      source: "interface A { b: B }"
    })
    expect(rendered?.evidence.nodes.map((node) => node.id)).toEqual(["src/b.ts:interface:B", "src/c.ts:type-alias:C"])
    expect(rendered?.evidence.edges.map((edge) => edge.symbol)).toEqual(["B", "C"])
    expect(rendered?.inputContract).toMatchObject({
      id: input.contract,
      completeness: "complete",
      rendererVersion: CANDIDATE_RENDERER_VERSION,
      rendererDigest: CANDIDATE_RENDERER_DIGEST
    })
    expect(rendered?.inputContract.projectionFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(rendered?.evidence.nodes)).toBe(true)
    expect(
      renderCandidateReviewInput({ ...input, nodes: [...input.nodes].reverse(), edges: [...input.edges].reverse() })
    ).toEqual(rendered)
  })

  it("preserves qualified reference spelling without relaxing declaration identities", () => {
    const input = fixture()
    for (const symbol of ["crate::receipt::Receipt", "R.Receipt", "self::receipt::Receipt"]) {
      const rendered = renderCandidateReviewInput({ ...input, edges: input.edges.map((edge) => ({ ...edge, symbol })) })
      expect(rendered?.evidence.edges.every((edge) => edge.symbol === symbol)).toBe(true)
    }
    for (const symbol of ["::Receipt", "R..Receipt", "R::", "R/Receipt", "R.Receipt()", "R Receipt", "R:::Receipt"]) {
      expect(
        renderCandidateReviewInput({ ...input, edges: input.edges.map((edge) => ({ ...edge, symbol })) })
      ).toBeUndefined()
    }
    expect(renderCandidateReviewInput({ ...input, artifact: { ...input.artifact, name: "R.A" } })).toBeUndefined()
  })

  it("keeps type and function wire contracts distinct", () => {
    const input = fixture()
    expect(renderCandidateReviewInput({ ...input, contract: "direct-event/function/v1" })).toBeUndefined()
    const functionInput = {
      ...input,
      contract: "direct-event/function/v1",
      artifact: { ...input.artifact, id: "src/a.ts:function:A", kind: "function", source: "function A() { return B }" },
      edges: input.edges.map((item) => ({
        ...item,
        from: item.from === input.artifact.id ? "src/a.ts:function:A" : item.from
      }))
    }
    expect(renderCandidateReviewInput(functionInput)?.inputContract.id).toBe("direct-event/function/v1")
  })

  it("renders a marked omission only for an incomplete-irrelevant rule input", () => {
    const input = fixture()
    const omitted = {
      from: input.artifact.id,
      kind: "omitted" as const,
      symbol: "Hidden",
      reason: "unresolved" as const,
      order: 3
    }
    const partial = renderCandidateReviewInput({
      ...input,
      completeness: "incomplete-irrelevant",
      edges: [...input.edges, omitted]
    })
    expect(partial?.inputContract.completeness).toBe("incomplete-irrelevant")
    expect(partial?.evidence.edges.at(-1)).toEqual(omitted)
    expect(renderCandidateReviewInput({ ...input, edges: [...input.edges, omitted] })).toBeUndefined()
  })

  it("preserves opaque omissions as bounded JSON data without permitting resolved expression bindings", () => {
    const input = fixture()
    for (const symbol of [
      "term => comparable.includes(term.toLowerCase())",
      "values[key]()",
      '() => {\n return "</evidence>\\\"}\\n{\\\"kind\\\":\\\"expanded\\\"}";\n}',
      "x".repeat(300)
    ]) {
      const omitted = {
        from: input.artifact.id,
        kind: "omitted" as const,
        symbol,
        reason: "unsupported" as const,
        order: 3
      }
      const partial = renderCandidateReviewInput({
        ...input,
        completeness: "incomplete-irrelevant",
        edges: [...input.edges, omitted]
      })
      expect(partial).toBeDefined()
      expect(partial?.evidence.edges.at(-1)).toEqual(omitted)
      expect(JSON.parse(JSON.stringify(partial)).evidence.edges.at(-1)).toEqual(omitted)
      expect(partial?.evidence.nodes).toHaveLength(2)
      expect(renderCandidateReviewInput({ ...input, edges: [...input.edges, omitted] })).toBeUndefined()
      expect(
        renderCandidateReviewInput({ ...input, edges: input.edges.map((edge) => ({ ...edge, symbol })) })
      ).toBeUndefined()
    }
    for (const symbol of ["", "bad\0reference", "x".repeat(21 * 1024), "x".repeat(257 * 1024)]) {
      expect(
        renderCandidateReviewInput({
          ...input,
          completeness: "incomplete-irrelevant",
          edges: [...input.edges, { from: input.artifact.id, kind: "omitted", symbol, reason: "unsupported", order: 3 }]
        })
      ).toBeUndefined()
    }
  })

  it("rejects incomplete, oversized, unresolved, or source-leaking facts", () => {
    const input = fixture()
    expect(renderCandidateReviewInput({ ...input, completeness: "incomplete" })).toBeUndefined()
    expect(renderCandidateReviewInput({ ...input, treeBytesLimit: 32 })).toBeUndefined()
    expect(
      renderCandidateReviewInput({ ...input, artifact: { ...input.artifact, domain: "/private/a.ts" } })
    ).toBeUndefined()
    expect(renderCandidateReviewInput({ ...input, artifact: { ...input.artifact, patch: "secret" } })).toBeUndefined()
    expect(
      renderCandidateReviewInput({ ...input, nodes: [{ ...input.nodes[0], domain: "../secret.ts" }] })
    ).toBeUndefined()
    expect(renderCandidateReviewInput({ ...input, edges: [{ ...input.edges[0], to: "missing" }] })).toBeUndefined()
    expect(renderCandidateReviewInput({ ...input, edges: [{ ...input.edges[0], kind: "omitted" }] })).toBeUndefined()
    expect(renderCandidateReviewInput({ ...input, nodes: [...input.nodes, input.nodes[0]] })).toBeUndefined()
    expect(
      renderCandidateReviewInput({
        ...input,
        edges: [{ from: input.artifact.id, to: input.nodes[1]!.id, kind: "expanded", symbol: "B", order: 1 }]
      })
    ).toBeUndefined()
    expect(
      renderCandidateReviewInput({
        ...input,
        edges: [
          { from: input.artifact.id, to: input.nodes[0]!.id, kind: "included", symbol: "C", order: 1 },
          ...input.edges
        ]
      })
    ).toBeUndefined()
    expect(
      renderCandidateReviewInput({ ...input, artifact: { ...input.artifact, id: "/private/project/a.ts:interface:A" } })
    ).toBeUndefined()
    expect(
      renderCandidateReviewInput({
        ...input,
        nodes: [{ ...input.nodes[0], id: "src/c.ts:function:C", kind: "function" }, input.nodes[1]],
        edges: input.edges.map((item) =>
          item.kind === "omitted"
            ? item
            : { ...item, to: item.to === input.nodes[0]!.id ? "src/c.ts:function:C" : item.to }
        )
      })
    ).toBeUndefined()
  })
})
