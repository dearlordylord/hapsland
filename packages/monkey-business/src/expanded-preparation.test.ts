import { describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import {
  generateFileTree,
  DEFAULT_FILE_TREE_PROFILE,
  PreparationReplay,
  createRun,
  restoreReplay,
  type FileTreeProfile
} from "./index.ts"
import { GRAPH_LIMIT_CEILINGS, type GraphLimits } from "@hapsland/canonical-policy/canonical/graph-limits"
import type { PreparationFrame } from "./preparation.ts"

const base: FileTreeProfile = {
  ...DEFAULT_FILE_TREE_PROFILE,
  minFiles: 3,
  maxFiles: 3,
  maxImports: 2,
  maxDepth: 2,
  deniedPercent: 0,
  minSourceBytes: 4,
  maxSourceBytes: 4,
  minTreeBytes: 3,
  maxTreeBytes: 3
}
const limits: GraphLimits = {
  version: 1,
  sourceBytes: 4,
  treeBytes: 100,
  files: 8,
  readBytes: 32,
  outgoingEdges: 2,
  depth: 2,
  work: 128
}
const pair: FileTreeProfile = { ...base, minFiles: 2, maxFiles: 2, maxImports: 1, maxDepth: 1 }
const single: FileTreeProfile = { ...base, minFiles: 1, maxFiles: 1, localWork: 5 }
const exact: GraphLimits = {
  version: 1,
  sourceBytes: 4,
  treeBytes: 3,
  files: 1,
  readBytes: 4,
  outgoingEdges: 1,
  depth: 1,
  work: 5
}
const cases: readonly { profile: FileTreeProfile; limits: GraphLimits; reason?: string }[] = [
  { profile: base, limits },
  { profile: { ...base, deniedPercent: 100 }, limits, reason: "Excluded" },
  { profile: { ...base, missingPercent: 100 }, limits, reason: "Omitted" },
  { profile: { ...base, unreadablePercent: 100 }, limits, reason: "Omitted" },
  { profile: { ...base, unsupportedPercent: 100 }, limits, reason: "Omitted" },
  { profile: { ...base, repeatedEdgePercent: 100, cyclicEdgePercent: 100 }, limits },
  { profile: { ...base, deadlineStep: 1 }, limits, reason: "Deadline" },
  { profile: base, limits: { ...limits, files: 2 }, reason: "Omitted" },
  { profile: { ...base, localWork: 129 }, limits, reason: "WorkLimit" },
  { profile: single, limits: exact },
  { profile: { ...single, minSourceBytes: 5, maxSourceBytes: 5 }, limits: exact, reason: "ReadLimit" },
  { profile: { ...single, minTreeBytes: 4, maxTreeBytes: 4 }, limits: exact, reason: "TreeLimit" },
  { profile: pair, limits: { ...limits, readBytes: 7 }, reason: "Omitted" },
  { profile: { ...base, maxImports: 1 }, limits: { ...limits, depth: 1 }, reason: "DepthLimit" },
  { profile: base, limits: { ...limits, outgoingEdges: 1 }, reason: "WorkLimit" },
  { profile: { ...pair, deadlineStep: 4 }, limits, reason: "Deadline" },
  { profile: { ...pair, deadlineStep: 5 }, limits, reason: "Deadline" },
  { profile: { ...pair, deadlineStep: 6 }, limits }
]
const replayTree = (profile: FileTreeProfile, graphLimits = limits) => {
  const tree = generateFileTree(7, 3, 0, profile, graphLimits)
  const replay = new PreparationReplay()
  const frames = tree.facts.map((fact, step) =>
    replay.step({
      kind: "preparationGraph",
      example: "generated",
      partition: 1,
      lifetime: 1,
      round: 1,
      operation: 3,
      unit: 0,
      step,
      fact,
      graphLimits
    })
  )
  return { tree, frames }
}
const reasonCode = (reason?: string): number =>
  reason === undefined
    ? 0
    : [
        "Missing",
        "Ambiguous",
        "Unsupported",
        "Omitted",
        "Excluded",
        "CaptureUnavailable",
        "FileLimit",
        "ReadLimit",
        "TreeLimit",
        "WorkLimit",
        "Deadline",
        "DepthLimit",
        "ProtocolViolation"
      ].indexOf(reason) + 1
const phaseCode = (phase: string) =>
  ["idle", "ready", "resolving", "checking", "capturing", "complete", "incomplete"].indexOf(phase)
const usage = (frame: PreparationFrame) => [
  phaseCode(frame.after.phase),
  reasonCode(frame.after.reason),
  frame.after.files,
  frame.after.readBytes,
  frame.after.treeBytes,
  frame.after.work
]
const command = (frame: PreparationFrame): number[] => {
  const value = frame.command
  const kind = [
    "none",
    "resolveEdge",
    "checkPath",
    "readSource",
    "unitComplete",
    "unitIncomplete",
    "skipImport"
  ].indexOf(value.kind)
  return [
    kind,
    "target" in value ? value.target : "edge" in value ? value.edge : 0,
    "reason" in value ? reasonCode(value.reason) : 0
  ]
}
const trace = (profile: FileTreeProfile, graphLimits: GraphLimits): number[][] => {
  const { tree, frames } = replayTree(profile, graphLimits)
  const last = frames.at(-1)
  if (last === undefined) throw new Error("missing preparation trace")
  return [
    ...tree.files.map((file) => [
      1,
      file.target,
      file.depth,
      Number(file.allowed),
      file.sourceBytes,
      file.treeBytes,
      ...file.edges
    ]),
    ...frames.map((frame, index) => [
      2,
      index,
      ["root", "next", "resolved", "pathChecked", "captured", "captureFailed", "deadlineReached"].indexOf(
        frame.event.fact.kind
      ),
      ...command(frame),
      ...usage(frame)
    ]),
    [3, ...usage(last), Number(tree.rootEligible), Number(tree.closureEligible)]
  ]
}

describe("expanded preparation through production decisions", () => {
  it.each(cases)(
    "observes independently expected omissions and evidence for $reason",
    ({ profile, limits: graphLimits, reason }) => {
      const { tree, frames } = replayTree(profile, graphLimits)
      const terminal = frames.at(-1)
      expect(terminal?.after.phase).toBe(reason ? "incomplete" : "complete")
      expect(terminal?.after.reason).toBe(reason)
      expect(tree.limits).toEqual(graphLimits)
      expect(tree.rootEligible).toBe(!["WorkLimit", "ReadLimit", "TreeLimit"].includes(reason ?? ""))
      expect(tree.closureEligible).toBe(reason === undefined)
      if (profile.deniedPercent === 100 || profile.missingPercent === 100 || profile.unsupportedPercent === 100)
        expect(frames.filter((frame) => frame.command.kind === "readSource")).toHaveLength(0)
      if (profile.missingPercent === 100)
        expect(frames.some((frame) => frame.command.kind === "skipImport" && frame.command.reason === "Missing")).toBe(
          true
        )
      if (profile.unsupportedPercent === 100)
        expect(
          frames.some((frame) => frame.command.kind === "skipImport" && frame.command.reason === "Unsupported")
        ).toBe(true)
    }
  )

  it("honors custom before/equality/after budgets and captures limits within a unit", () => {
    const single = { ...base, minFiles: 1, maxFiles: 1, localWork: 5 }
    const exact: GraphLimits = {
      version: 1,
      sourceBytes: 4,
      treeBytes: 3,
      files: 1,
      readBytes: 4,
      outgoingEdges: 1,
      depth: 1,
      work: 5
    }
    expect(replayTree(single, exact).frames.at(-1)?.after).toMatchObject({
      phase: "complete",
      files: 1,
      readBytes: 4,
      treeBytes: 3,
      work: 5
    })
    expect(replayTree({ ...single, localWork: 4 }, exact).frames.at(-1)?.after.phase).toBe("complete")
    expect(replayTree({ ...single, localWork: 6 }, exact).frames.at(-1)?.after.reason).toBe("WorkLimit")
    expect(replayTree({ ...single, minSourceBytes: 5, maxSourceBytes: 5 }, exact).frames.at(-1)?.after.reason).toBe(
      "ReadLimit"
    )
    expect(replayTree({ ...single, minTreeBytes: 4, maxTreeBytes: 4 }, exact).frames.at(-1)?.after.reason).toBe(
      "TreeLimit"
    )
    const replay = new PreparationReplay()
    replay.step({
      kind: "preparationGraph",
      example: "simple",
      partition: 1,
      lifetime: 1,
      round: 1,
      operation: 9,
      unit: 0,
      step: 0,
      graphLimits: exact,
      fact: { kind: "root", target: 1, sourceBytes: 4, treeBytes: 3, edges: [] }
    })
    const terminal = replay.step({
      kind: "preparationGraph",
      example: "simple",
      partition: 1,
      lifetime: 1,
      round: 1,
      operation: 9,
      unit: 0,
      step: 1,
      graphLimits: GRAPH_LIMIT_CEILINGS,
      fact: { kind: "next" }
    })
    expect(terminal.after.limits).toEqual(exact)
  })

  it("distinguishes depth, edge-work and read-reservation boundaries from generated facts", () => {
    const chain = { ...base, minFiles: 3, maxFiles: 3, maxImports: 1, maxDepth: 2 }
    expect(replayTree(chain, { ...limits, depth: 2 }).frames.at(-1)?.after).toMatchObject({
      phase: "complete",
      files: 3
    })
    expect(replayTree(chain, { ...limits, depth: 1 }).frames.at(-1)?.after.reason).toBe("DepthLimit")
    expect(replayTree(base, { ...limits, outgoingEdges: 1 }).frames.at(-1)?.after.reason).toBe("WorkLimit")
    const pair = { ...base, minFiles: 2, maxFiles: 2, maxImports: 1, maxDepth: 1 }
    expect(replayTree(pair, { ...limits, outgoingEdges: 1, readBytes: 8 }).frames.at(-1)?.after).toMatchObject({
      phase: "complete",
      readBytes: 8
    })
    expect(replayTree(pair, { ...limits, outgoingEdges: 1, readBytes: 9 }).frames.at(-1)?.after.phase).toBe("complete")
    const refused = replayTree(pair, { ...limits, outgoingEdges: 1, readBytes: 7 })
    expect(
      refused.frames.some((frame) => frame.command.kind === "skipImport" && frame.command.reason === "ReadLimit")
    ).toBe(true)
    expect(refused.frames.at(-1)?.after).toMatchObject({
      phase: "incomplete",
      reason: "Omitted",
      files: 1,
      readBytes: 4
    })
  })

  it("fires deadlines before and at completion, while a later fact index preserves completion", () => {
    // Two files require root, next, resolved, path gate, capture, next: terminal index 5.
    const pair = { ...base, minFiles: 2, maxFiles: 2, maxImports: 1, maxDepth: 1 }
    expect(replayTree({ ...pair, deadlineStep: 4 }).frames.at(-1)?.after).toMatchObject({
      phase: "incomplete",
      reason: "Deadline",
      files: 1
    })
    expect(replayTree({ ...pair, deadlineStep: 5 }).frames.at(-1)?.after).toMatchObject({
      phase: "incomplete",
      reason: "Deadline",
      files: 2
    })
    expect(replayTree({ ...pair, deadlineStep: 6 }).frames.at(-1)?.after).toMatchObject({ phase: "complete", files: 2 })
  })

  it("retains separate multi-unit inner facts and independent supplied offers through ordinary replay", () => {
    const run = createRun({
      seed: 7,
      fileTrees: { ...base, missingPercent: 100 },
      inputs: [{ kind: "edit", at: 0, bytes: 20, unitBytes: [5, 7] }],
      outcome: "clear"
    })
    run.advance()
    const graphs = run.observations.filter((frame) => frame.preparation !== undefined)
    expect(new Set(graphs.map((frame) => frame.preparation?.event.unit))).toEqual(new Set([0, 1]))
    expect(graphs.every((frame) => frame.before.global.items === frame.after.global.items)).toBe(true)
    expect(
      run.observations
        .flatMap((frame) => frame.commands)
        .filter((cmd) => cmd.kind === "unitAdmitted")
        .map((cmd) => cmd.bytes)
    ).toEqual([5, 7])
    expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observations).toEqual(run.observations)
  })

  it("captures production limits before later live controls and reproduces both profiles", () => {
    const run = createRun({
      seed: 7,
      fileTrees: base,
      graphLimits: limits,
      preparationDelay: 20,
      inputs: [
        { kind: "edit", at: 0, bytes: 20, unitBytes: [5] },
        { kind: "edit", at: 100, bytes: 20, unitBytes: [5] }
      ],
      outcome: "clear"
    })
    while (!run.observations.some((frame) => frame.preparation?.event.step === 0)) run.step()
    const operation = run.observations.at(-1)?.preparation?.event.operation
    run.applyControl({ kind: "graphLimits", limits: { ...limits, files: 1 } })
    const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
    run.advance()
    restored.advance()
    expect(restored.observations).toEqual(run.observations)
    const first = run.observations.filter((frame) => frame.preparation?.event.operation === operation)
    const later = run.observations.filter(
      (frame) => frame.preparation && frame.preparation.event.operation !== operation
    )
    expect(first.at(-1)?.preparation?.after).toMatchObject({ phase: "complete", files: 3, limits })
    expect(later.at(-1)?.preparation?.after).toMatchObject({
      phase: "incomplete",
      files: 1,
      limits: { ...limits, files: 1 }
    })
  })

  it("matches native Bend on original generated inputs and every intermediate public graph frame", () => {
    const directory = mkdtempSync(join(tmpdir(), "hapsland-expanded-preparation-"))
    try {
      const source = join(directory, "scenario.c"),
        binary = join(directory, "scenario")
      const emit = spawnSync(
        "bend",
        [
          fileURLToPath(new URL("../../monkey-business-bend/conformance/expanded-preparation.bend", import.meta.url)),
          "-o",
          source
        ],
        { encoding: "utf8", timeout: 5000 }
      )
      expect(emit.error).toBeUndefined()
      expect(emit.status, emit.stdout + emit.stderr).toBe(0)
      const compile = spawnSync("clang", ["-O0", "-Wno-unused-value", source, "-o", binary, "-lm", "-pthread"], {
        encoding: "utf8",
        timeout: 15000
      })
      expect(compile.error).toBeUndefined()
      expect(compile.status, compile.stdout + compile.stderr).toBe(0)
      const native = spawnSync(binary, [], { encoding: "utf8", timeout: 5000 })
      expect(native.error).toBeUndefined()
      expect(native.status, native.stdout + native.stderr).toBe(0)
      expect(JSON.parse(native.stdout)).toEqual(cases.map((value) => trace(value.profile, value.limits)))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
