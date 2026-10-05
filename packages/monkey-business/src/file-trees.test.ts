import { describe, expect, it } from "vitest"
import fc from "fast-check"
import {
  createRun,
  restoreReplay,
  generateFileTree,
  validateFileTreeProfile,
  DEFAULT_FILE_TREE_PROFILE,
  PreparationReplay,
  type FileTreeProfile
} from "./index.ts"

const profile = (changes: Partial<FileTreeProfile> = {}): FileTreeProfile => ({
  ...DEFAULT_FILE_TREE_PROFILE,
  ...changes
})
const frames = (seed: number, settings: FileTreeProfile) => {
  const tree = generateFileTree(seed, 3, 0, settings)
  const replay = new PreparationReplay()
  return tree.facts.map((fact, step) =>
    replay.step({
      kind: "preparationGraph",
      example: "generated",
      partition: 1,
      lifetime: 1,
      round: 1,
      operation: 3,
      unit: 0,
      step,
      fact
    })
  )
}
const profiles = fc
  .record({
    maxImports: fc.integer({ min: 0, max: 5 }),
    maxDepth: fc.integer({ min: 0, max: 6 }),
    requestedFiles: fc.integer({ min: 1, max: 64 }),
    deniedPercent: fc.integer({ min: 0, max: 100 }),
    minSourceBytes: fc.integer({ min: 1, max: 300000 }),
    extraSource: fc.integer({ min: 0, max: 300000 }),
    minTreeBytes: fc.integer({ min: 1, max: 30000 }),
    extraTree: fc.integer({ min: 0, max: 30000 })
  })
  .map((raw) => {
    let capacity = 1,
      level = 1
    for (let depth = 0; depth < raw.maxDepth && capacity < 64; depth++) {
      level *= raw.maxImports
      capacity += level
    }
    return profile({
      maxImports: raw.maxImports,
      maxDepth: raw.maxDepth,
      deniedPercent: raw.deniedPercent,
      minSourceBytes: raw.minSourceBytes,
      minTreeBytes: raw.minTreeBytes,
      minFiles: 1,
      maxFiles: Math.min(raw.requestedFiles, capacity),
      maxSourceBytes: raw.minSourceBytes + raw.extraSource,
      maxTreeBytes: raw.minTreeBytes + raw.extraTree
    })
  })

describe("seeded file-tree generation", () => {
  it("preserves topology bounds, captures only permitted paths, and terminates under checked budgets", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), profiles, (seed, settings) => {
        const tree = generateFileTree(seed, 3, 0, settings)
        expect(tree).toEqual(generateFileTree(seed, 3, 0, settings))
        expect(tree.files.length).toBeGreaterThanOrEqual(settings.minFiles)
        expect(tree.files.length).toBeLessThanOrEqual(settings.maxFiles)
        expect(tree.files[0]!.allowed).toBe(true)
        for (const file of tree.files) {
          expect(file.depth).toBeLessThanOrEqual(settings.maxDepth)
          expect(file.edges.length).toBeLessThanOrEqual(settings.maxImports)
          expect(file.sourceBytes).toBeGreaterThanOrEqual(settings.minSourceBytes)
          expect(file.sourceBytes).toBeLessThanOrEqual(settings.maxSourceBytes)
          expect(file.treeBytes).toBeGreaterThanOrEqual(settings.minTreeBytes)
          expect(file.treeBytes).toBeLessThanOrEqual(settings.maxTreeBytes)
          for (const edge of file.edges) {
            expect(tree.files[edge - 1]!.depth).toBe(file.depth + 1)
            expect(edge).toBeGreaterThan(file.target)
          }
        }
        const checked = frames(seed, settings)
        for (const frame of checked) {
          expect(frame.after.files).toBeLessThanOrEqual(frame.after.limits.files)
          expect(frame.after.treeBytes).toBeLessThanOrEqual(frame.after.limits.treeBytes)
          expect(frame.after.readBytes).toBeLessThanOrEqual(frame.after.limits.readBytes)
          expect(frame.after.reason).not.toBe("ProtocolViolation")
          if (frame.command.kind === "readSource") expect(tree.files[frame.command.target - 1]!.allowed).toBe(true)
        }
        expect(["complete", "incomplete"]).toContain(checked.at(-1)!.after.phase)
      }),
      { numRuns: 100, seed: 20260930 }
    )
  })

  it("varies trees across artifacts and seeds without sharing the Jev outcome stream", () => {
    const trees = Array.from({ length: 10 }, (_, seed) => JSON.stringify(generateFileTree(seed, 3, 0)))
    expect(new Set(trees).size).toBe(10)
    expect(generateFileTree(7, 3, 0)).not.toEqual(generateFileTree(7, 5, 0))
    expect(generateFileTree(7, 3, 0)).not.toEqual(generateFileTree(7, 3, 1))
  })

  it("emits no source capture for denied imports and exercises depth and evidence caps", () => {
    const denied = frames(7, profile({ minFiles: 4, maxFiles: 4, deniedPercent: 100 }))
    expect(denied.filter((frame) => frame.command.kind === "readSource")).toHaveLength(0)
    expect(denied.at(-1)!.after).toMatchObject({ files: 1, phase: "incomplete", reason: "Excluded" })
    const deep = frames(
      7,
      profile({
        minFiles: 7,
        maxFiles: 7,
        maxImports: 1,
        maxDepth: 6,
        deniedPercent: 0,
        minTreeBytes: 1,
        maxTreeBytes: 1
      })
    )
    expect(deep.at(-1)!.after.reason).toBe("DepthLimit")
    const large = frames(
      7,
      profile({ minFiles: 2, maxFiles: 2, deniedPercent: 0, minTreeBytes: 15000, maxTreeBytes: 15000 })
    )
    expect(large.at(-1)!.after).toMatchObject({ files: 2, treeBytes: 15000, reason: "TreeLimit" })
    expect(large.some((frame) => frame.command.kind === "skipImport" && frame.command.reason === "TreeLimit")).toBe(
      true
    )
  })

  it("follows checked missing, unreadable, repeated, cyclic and deadline facts", () => {
    const base = profile({
      minFiles: 3,
      maxFiles: 3,
      deniedPercent: 0,
      minSourceBytes: 1,
      maxSourceBytes: 1,
      minTreeBytes: 1,
      maxTreeBytes: 1
    })
    for (const [change, reason] of [
      [{ missingPercent: 100 }, "Omitted"],
      [{ unreadablePercent: 100 }, "Omitted"],
      [{ deadlineStep: 1 }, "Deadline"]
    ] as const) {
      const checked = frames(7, { ...base, ...change })
      expect(checked.at(-1)!.after).toMatchObject({ phase: "incomplete", reason })
      expect(generateFileTree(7, 3, 0, { ...base, ...change })).toEqual(
        generateFileTree(7, 3, 0, { ...base, ...change })
      )
      if ("missingPercent" in change)
        expect(checked.some((frame) => frame.command.kind === "skipImport" && frame.command.reason === "Missing")).toBe(
          true
        )
      if ("unreadablePercent" in change)
        expect(
          checked.some((frame) => frame.command.kind === "skipImport" && frame.command.reason === "CaptureUnavailable")
        ).toBe(true)
      const run = createRun({
        seed: 7,
        fileTrees: { ...base, ...change },
        preparationDelay: 20,
        inputs: [{ kind: "edit", at: 0, bytes: 10, unitBytes: [5] }]
      })
      run.advance()
      expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations)
    }
    const graph = frames(7, { ...base, repeatedEdgePercent: 100, cyclicEdgePercent: 100 })
    expect(graph.at(-1)!.after).toMatchObject({ phase: "complete", files: 3 })
    expect(graph.filter((frame) => frame.command.kind === "readSource")).toHaveLength(2)
  })

  it("accepts exact source and evidence budgets and rejects the next byte", () => {
    const single = profile({
      minFiles: 1,
      maxFiles: 1,
      minSourceBytes: 262144,
      maxSourceBytes: 262144,
      minTreeBytes: 20480,
      maxTreeBytes: 20480
    })
    expect(frames(7, single).at(-1)!.after).toMatchObject({ phase: "complete", readBytes: 262144, treeBytes: 20480 })
    expect(frames(7, { ...single, minSourceBytes: 262145, maxSourceBytes: 262145 }).at(-1)!.after).toMatchObject({
      phase: "incomplete",
      reason: "ReadLimit"
    })
    expect(frames(7, { ...single, minTreeBytes: 20481, maxTreeBytes: 20481 }).at(-1)!.after).toMatchObject({
      phase: "incomplete",
      reason: "TreeLimit"
    })
    expect(frames(7, { ...single, localWork: 128 }).at(-1)!.after).toMatchObject({ phase: "complete", work: 128 })
    expect(frames(7, { ...single, localWork: 129 }).at(-1)!.after).toMatchObject({
      phase: "incomplete",
      reason: "WorkLimit"
    })
    const many = profile({
      minFiles: 8,
      maxFiles: 8,
      deniedPercent: 0,
      minSourceBytes: 1,
      maxSourceBytes: 1,
      minTreeBytes: 1,
      maxTreeBytes: 1,
      maxDepth: 1,
      maxImports: 16
    })
    expect(frames(7, many).at(-1)!.after).toMatchObject({ phase: "complete", files: 8 })
    expect(frames(7, { ...many, minFiles: 9, maxFiles: 9 }).at(-1)!.after).toMatchObject({
      phase: "incomplete",
      files: 8,
      reason: "Omitted"
    })
    const depth = { ...many, minFiles: 5, maxFiles: 5, maxImports: 1, maxDepth: 4 }
    expect(frames(7, depth).at(-1)!.after).toMatchObject({ phase: "complete", files: 5 })
    expect(frames(7, { ...depth, minFiles: 6, maxFiles: 6, maxDepth: 5 }).at(-1)!.after).toMatchObject({
      phase: "incomplete",
      reason: "DepthLimit"
    })
    const edgeBoundary = frames(7, { ...many, minFiles: 17, maxFiles: 17 })
    expect(edgeBoundary[0]!.after.phase).toBe("ready")
    expect(frames(7, { ...many, minFiles: 18, maxFiles: 18, maxImports: 17 })[0]!.after).toMatchObject({
      phase: "incomplete",
      reason: "WorkLimit"
    })
    const read = { ...many, minFiles: 6, maxFiles: 6, minSourceBytes: 262144, maxSourceBytes: 262144 }
    expect(frames(7, read).at(-1)!.after).toMatchObject({ phase: "complete", readBytes: 1572864 })
    expect(frames(7, { ...read, minFiles: 7, maxFiles: 7 }).at(-1)!.after).toMatchObject({
      phase: "incomplete",
      readBytes: 1572864,
      reason: "Omitted"
    })
  })

  it("rejects impossible shapes, reversed ranges and invalid numeric settings", () => {
    expect(() => validateFileTreeProfile(profile({ maxImports: 1, maxDepth: 1 }))).toThrow("capacity")
    expect(() => validateFileTreeProfile(profile({ minFiles: 9 }))).toThrow("must not exceed")
    expect(() => validateFileTreeProfile(profile({ minSourceBytes: 5000 }))).toThrow("must not exceed")
    expect(() => validateFileTreeProfile(profile({ deniedPercent: 101 }))).toThrow("Denied import targets")
    expect(() => validateFileTreeProfile(profile({ maxDepth: 1.5 }))).toThrow("integer")
  })

  it("captures in-flight facts and restores controls midway through preparation exactly", () => {
    const run = createRun({
      seed: 7,
      preparationDelay: 20,
      inputs: [
        { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
        { at: 100, kind: "edit", bytes: 10, unitBytes: [5] }
      ]
    })
    while (!run.observations.some((frame) => frame.preparation?.event.step === 0)) run.step()
    const operation = run.observations.at(-1)!.preparation!.event.operation
    run.applyControl({ kind: "fileTrees", profile: profile({ minFiles: 4, maxFiles: 4, deniedPercent: 100 }) })
    const restored = restoreReplay(run.exportReplay())
    run.advance()
    restored.advance()
    expect(restored.observations).toEqual(run.observations)
    const initial = run.observations
      .filter((frame) => frame.preparation?.event.operation === operation)
      .map((frame) => frame.preparation!.event.fact)
    expect(initial).toEqual(generateFileTree(7, operation, 0).facts)
    const later = run.observations.filter(
      (frame) => frame.preparation && frame.preparation.event.operation !== operation
    )
    expect(later.at(-1)!.preparation!.after).toMatchObject({ files: 1, reason: "Excluded" })
    expect(later[0]!.preparation!.event.generatedTree?.files).toBe(4)
  })
})
