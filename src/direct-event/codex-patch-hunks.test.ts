import { describe, expect, it } from "vitest"
import { verifyCodexPostEditHunks } from "@hapsland/native-observation/direct-event/codex-patch-hunks"

const patch = (body: string) => `*** Begin Patch\n${body}\n*** End Patch`
const update = (body: string) => patch(`*** Update File: src/example.ts\n@@\n${body}`)
const spans = (command: string, source: string) =>
  verifyCodexPostEditHunks(command, "src/example.ts", source)?.map(({ location }) => location)

describe("Codex post-edit hunk verification", () => {
  it("checks ordered context and additions and returns half-open coordinates", () => {
    const command = update(" export type A = 1;\n-export type B = 1;\n+export type B = 2;\n export type C = 1;")
    expect(spans(command, "export type A = 1;\nexport type B = 2;\nexport type C = 1;\n")).toEqual([
      { start: { line: 2, column: 1 }, end: { line: 3, column: 1 } }
    ])
  })

  it("keeps separate changed blocks separate and maps an anchored deletion to an empty span", () => {
    const command = update(" before\n-old\n between\n+new\n after")
    expect(spans(command, "before\nbetween\nnew\nafter")).toEqual([
      { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
      { start: { line: 3, column: 1 }, end: { line: 4, column: 1 } }
    ])
  })

  it("matches multiple ordered hunks and terminal source positions", () => {
    const command = patch("*** Update File: src/example.ts\n@@ A\n A\n+AA\n@@ B\n B\n+BB")
    expect(spans(command, "A\nAA\nB\nBB")).toEqual([
      { start: { line: 2, column: 1 }, end: { line: 3, column: 1 } },
      { start: { line: 4, column: 1 }, end: { line: 4, column: 3 } }
    ])
  })

  it("uses only the exact requested path in a multi-file patch", () => {
    const command = patch(
      "*** Add File: other.ts\n+unused\n*** Update File: src/example.ts\n@@\n+unique\n*** Update File: another.ts\n@@\n+elsewhere"
    )
    expect(spans(command, "unique\n")).toEqual([{ start: { line: 1, column: 1 }, end: { line: 2, column: 1 } }])
    expect(verifyCodexPostEditHunks(command, "another.ts", "elsewhere")).toBeDefined()
  })

  it("anchors the native end-of-file marker to the actual final line", () => {
    const command = update("-old\n+same\n*** End of File")
    expect(spans(command, "same\nsame\n")).toEqual([{ start: { line: 2, column: 1 }, end: { line: 3, column: 1 } }])
    expect(spans(command, "same\nlater\n")).toBeUndefined()
    expect(spans(command, "same")).toEqual([{ start: { line: 1, column: 1 }, end: { line: 1, column: 5 } }])
  })

  it("rejects misplaced or repeated end-of-file markers", () => {
    for (const body of [
      "*** End of File\n+new",
      "+new\n*** End of File\n+later",
      "+new\n*** End of File\n*** End of File",
      "+new\n*** End of File\n@@\n+later"
    ])
      expect(spans(update(body), "new\nlater")).toBeUndefined()
  })

  it("rejects duplicate post-edit matches even when a header names one", () => {
    expect(spans(update("+same"), "same\nsame\n")).toBeUndefined()
    expect(spans(patch("*** Update File: src/example.ts\n@@ unique-name\n+same"), "same\nsame\n")).toBeUndefined()
  })

  it("rejects wrong ordering, absent context, and unanchored deletions", () => {
    expect(spans(update(" first\n+new\n last"), "last\nnew\nfirst")).toBeUndefined()
    expect(spans(update(" missing\n+new"), "new")).toBeUndefined()
    expect(spans(update("-old"), "new")).toBeUndefined()
  })

  it("rejects unsupported and malformed target patches", () => {
    expect(spans(patch("*** Update File: src/example.ts\n*** Move to: moved.ts\n@@\n+new"), "new")).toBeUndefined()
    expect(spans(patch("*** Delete File: src/example.ts"), "new")).toBeUndefined()
    expect(spans(patch("*** Update File: src/example.ts\n@@\n new"), "new")).toBeUndefined()
    expect(spans(patch("*** Update File: src/example.ts\n@@@\n+new"), "new")).toBeUndefined()
    expect(
      spans(patch("*** Update File: src/example.ts\n@@\n+new\n*** Update File: src/example.ts\n@@\n+new"), "new")
    ).toBeUndefined()
  })
})
