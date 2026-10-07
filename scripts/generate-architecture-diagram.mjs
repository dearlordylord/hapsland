import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { productionFlowMermaid } from "../packages/agent-flow-viz/src/production-flow-mermaid.ts"

const start = "<!-- production-flow:start -->"
const end = "<!-- production-flow:end -->"
const path = resolve(import.meta.dirname, "../docs/architecture.md")

export const architectureWithFlowDiagram = (current) => {
  const begin = current.indexOf(start)
  const finish = current.indexOf(end)
  if (
    begin < 0 ||
    finish < begin ||
    current.indexOf(start, begin + start.length) !== -1 ||
    current.indexOf(end, finish + end.length) !== -1
  ) {
    throw new Error("Architecture flow diagram requires one ordered pair of markers")
  }
  const block = [start, "", "```mermaid", productionFlowMermaid(), "```", end].join("\n")
  return `${current.slice(0, begin)}${block}${current.slice(finish + end.length)}`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const current = readFileSync(path, "utf8")
  const next = architectureWithFlowDiagram(current)
  if (process.argv.includes("--check")) {
    if (next !== current) throw new Error("Architecture flow diagram is stale; run npm run docs:generate")
    console.log("Architecture flow diagram matches the dashboard model")
  } else {
    writeFileSync(path, next)
  }
}
