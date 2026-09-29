import { describe, expect, it } from "vitest";
import {
  CANDIDATE_RENDERER_DIGEST, CANDIDATE_RENDERER_VERSION, renderCandidateReviewInput,
  type CandidateReviewInput,
} from "./v2-renderer.ts";

const fixture = (): CandidateReviewInput => ({
  contract: "direct-event/type-shape/v2", completeness: "complete", treeBytesLimit: 20 * 1024,
  artifact: { id: "root", kind: "interface", name: "A", domain: "src/a.ts", source: "interface A { b: B }" },
  nodes: [
    { id: "c", kind: "type-alias", name: "C", domain: "src/c.ts", source: "type C = string", order: 2 },
    { id: "b", kind: "interface", name: "B", domain: "src/b.ts", source: "interface B { c: C }", order: 1 },
  ],
  edges: [
    { from: "b", to: "c", kind: "expanded", symbol: "C", order: 2 },
    { from: "root", to: "b", kind: "expanded", symbol: "B", order: 1 },
  ],
});

describe("candidate review input renderer", () => {
  it("renders ordered complete evidence with stable version and fingerprint", () => {
    const input = fixture();
    const rendered = renderCandidateReviewInput(input);
    expect(rendered).toBeDefined();
    expect(rendered?.artifact).toEqual({ kind: "interface", name: "A", domain: "src/a.ts", source: "interface A { b: B }" });
    expect(rendered?.evidence.nodes.map((node) => node.id)).toEqual(["b", "c"]);
    expect(rendered?.evidence.edges.map((edge) => edge.symbol)).toEqual(["B", "C"]);
    expect(rendered?.inputContract).toMatchObject({ id: input.contract, completeness: "complete",
      rendererVersion: CANDIDATE_RENDERER_VERSION, rendererDigest: CANDIDATE_RENDERER_DIGEST });
    expect(rendered?.inputContract.projectionFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(rendered?.evidence.nodes)).toBe(true);
    expect(renderCandidateReviewInput({ ...input, nodes: [...input.nodes].reverse(), edges: [...input.edges].reverse() }))
      .toEqual(rendered);
  });

  it("keeps type and function wire contracts distinct", () => {
    const input = fixture();
    expect(renderCandidateReviewInput({ ...input, contract: "direct-event/function/v1" })).toBeUndefined();
    const functionInput = { ...input, contract: "direct-event/function/v1",
      artifact: { ...input.artifact, kind: "function", source: "function A() { return B }" } };
    expect(renderCandidateReviewInput(functionInput)?.inputContract.id).toBe("direct-event/function/v1");
  });

  it("rejects incomplete, oversized, unresolved, or source-leaking facts", () => {
    const input = fixture();
    expect(renderCandidateReviewInput({ ...input, completeness: "incomplete" })).toBeUndefined();
    expect(renderCandidateReviewInput({ ...input, treeBytesLimit: 32 })).toBeUndefined();
    expect(renderCandidateReviewInput({ ...input, artifact: { ...input.artifact, domain: "/private/a.ts" } })).toBeUndefined();
    expect(renderCandidateReviewInput({ ...input, artifact: { ...input.artifact, patch: "secret" } })).toBeUndefined();
    expect(renderCandidateReviewInput({ ...input, nodes: [{ ...input.nodes[0], domain: "../secret.ts" }] })).toBeUndefined();
    expect(renderCandidateReviewInput({ ...input, edges: [{ ...input.edges[0], to: "missing" }] })).toBeUndefined();
    expect(renderCandidateReviewInput({ ...input, edges: [{ ...input.edges[0], kind: "omitted" }] })).toBeUndefined();
    expect(renderCandidateReviewInput({ ...input, nodes: [...input.nodes, input.nodes[0]] })).toBeUndefined();
    expect(renderCandidateReviewInput({ ...input, edges: [{ from: "root", to: "b", kind: "expanded", symbol: "B", order: 1 }] })).toBeUndefined();
    expect(renderCandidateReviewInput({ ...input, edges: [
      { from: "root", to: "c", kind: "included", symbol: "C", order: 1 },
      ...input.edges,
    ] })).toBeUndefined();
  });
});
