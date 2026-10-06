import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as Schema from "effect/Schema"
import type { DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"

const Trace = Schema.Struct({
  version: Schema.Literal(1),
  sessionId: Schema.String,
  at: Schema.Number.check(Schema.makeFilter(Number.isSafeInteger)),
  kind: Schema.Literals(["edit", "delivery", "terminal"]),
  sourceHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  ruleIds: Schema.optionalKey(Schema.Array(Schema.String.check(Schema.isPattern(/^[a-z0-9_/-]{1,100}$/)))),
  state: Schema.optionalKey(Schema.Literals(["clear", "findings"]))
})
interface Trace extends Schema.Schema.Type<typeof Trace> {}
const isTrace = Schema.is(Trace)
type TraceEntry = {
  readonly kind: Trace["kind"]
  readonly sourceHash?: string
  readonly ruleIds?: readonly string[]
  readonly state?: "clear" | "findings"
}
const OwnedBudget = Schema.Struct({ root: Schema.String })
const isOwnedBudget = Schema.is(OwnedBudget)
const ownsDemoRoot = (budgetPath: string, root: string): boolean => {
  const budget: unknown = JSON.parse(readFileSync(budgetPath, "utf8"))
  return isOwnedBudget(budget) && budget.root === root
}
const traceRuleIds = (ruleIds: readonly string[] | undefined) =>
  ruleIds === undefined ? {} : { ruleIds: ruleIds.slice(0, 16) }
const traceState = (state: Trace["state"]) => (state === undefined ? {} : { state })
const traceSourceHash = (entry: TraceEntry, root: string): string | undefined =>
  entry.kind === "terminal" ? entry.sourceHash : demoSourceHash(root)
const validSourceHash = (value: string | undefined): value is string =>
  value !== undefined && /^[a-f0-9]{64}$/.test(value)
const recordTraceEntry = (budgetPath: string, root: string, advicee: DirectAdvicee, entry: TraceEntry): void => {
  try {
    if (!ownsDemoRoot(budgetPath, root)) return
    const sourceHash = traceSourceHash(entry, root)
    if (!validSourceHash(sourceHash)) return
    const directory = `${budgetPath}.trace`
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const trace: Trace = {
      version: 1,
      sessionId: advicee.sessionId,
      at: Date.now(),
      kind: entry.kind,
      sourceHash,
      ...traceRuleIds(entry.ruleIds),
      ...traceState(entry.state)
    }
    writeFileSync(join(directory, `${trace.at}.${randomUUID()}.json`), `${JSON.stringify(trace)}\n`, {
      mode: 0o600,
      flag: "wx"
    })
  } catch {
    /* Evidence must not alter a host edit. */
  }
}
const readTraceEntry = (path: string, sessionId: string): readonly Trace[] => {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"))
    return isTrace(value) && value.sessionId === sessionId ? [value] : []
  } catch {
    return []
  }
}

export const demoSourceHash = (root: string): string | undefined => {
  try {
    return createHash("sha256")
      .update(readFileSync(join(root, "session.ts")))
      .digest("hex")
  } catch {
    return undefined
  }
}

/** Best-effort source-free evidence scoped to the demo budget's owned root. */
export const recordDemoTrace = (
  budgetPath: string | null | undefined,
  root: string,
  advicee: DirectAdvicee,
  entry: TraceEntry
): void => {
  if (budgetPath == null) return
  recordTraceEntry(budgetPath, root, advicee, entry)
}
export const readDemoTrace = (budgetPath: string, sessionId: string): readonly Trace[] => {
  try {
    return readdirSync(`${budgetPath}.trace`)
      .flatMap((name) => (name.endsWith(".json") ? readTraceEntry(join(`${budgetPath}.trace`, name), sessionId) : []))
      .sort((a, b) => a.at - b.at)
  } catch {
    return []
  }
}
