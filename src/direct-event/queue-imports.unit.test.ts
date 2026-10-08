import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { analyzeTypeFile } from "@hapsland/source-analysis/direct-event/analyzer"

const source = readFileSync(new URL("./fixtures/queue.ts.txt", import.meta.url), "utf8")

it("extracts queue types despite unrelated value imports", () => {
  const analysis = analyzeTypeFile("src/queue.ts", source)
  expect(analysis.status).toBe("analyzed")
  if (analysis.status !== "analyzed") return
  expect(
    analysis.units.filter((outcome) => outcome.status === "ready").map((outcome) => outcome.unit.root.artifact.name)
  ).toEqual(["Base", "Job", "Command"])
})

it("keeps a referenced value import incomplete without excluding independent types", () => {
  const analysis = analyzeTypeFile(
    "a.ts",
    "import { External } from './external'; type Unsafe = External; type Safe = number"
  )
  expect(analysis.status).toBe("analyzed")
  if (analysis.status !== "analyzed") return
  expect(analysis.units.map((outcome) => ({ name: outcome.unit.root.artifact.name, status: outcome.status }))).toEqual([
    { name: "Unsafe", status: "unsupported" },
    { name: "Safe", status: "ready" }
  ])
})
