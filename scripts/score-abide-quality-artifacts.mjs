// Research scoring retains the classic TypeScript 5.9.3 compiler API; production uses TypeScript 7.
import ts from "@hapsland/scorer-typescript"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { tasks } from "./abide-quality-fixtures.mjs"

// Only blind artifact directories are input. This tool never opens arm ledgers.
const argument = (name, fallback) =>
  process.argv.find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback
const root = path.resolve(argument("--blind-root", ".test-runs/abide-quality-native/blind"))
const output = path.resolve(argument("--output", ".test-runs/abide-quality-native/blind-scores.json"))
const digest = (s) => crypto.createHash("sha256").update(s).digest("hex")
const options = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  types: []
}
function programFor(dir, probe = "") {
  const probePath = path.join(dir, "__blind_probe.ts")
  const host = ts.createCompilerHost(options)
  const baseRead = host.readFile.bind(host),
    baseExists = host.fileExists.bind(host)
  const text = 'import type { CaseState } from "./subject.js";\n' + probe
  host.readFile = (file) => (file === probePath ? text : baseRead(file))
  host.fileExists = (file) => file === probePath || baseExists(file)
  return ts.createProgram([path.join(dir, "subject.ts"), probePath], options, host)
}
export function score(dir, blindId) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "task.json"), "utf8"))
  const identity = meta.caseId ?? meta.task?.caseId ?? meta.taskId ?? meta.id
  const task = tasks.find((t) => t.caseId === identity || t.id === identity)
  if (!task) throw new Error(`Unknown task identity in ${blindId}`)
  const source = fs.readFileSync(path.join(dir, "subject.ts"), "utf8")
  const p = programFor(dir),
    checker = p.getTypeChecker()
  const sf = p.getSourceFile(path.join(dir, "subject.ts"))
  const moduleSymbol = checker.getSymbolAtLocation(sf)
  const symbol = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((s) => s.name === "CaseState")
  const rootType = symbol ? checker.getDeclaredTypeOfSymbol(symbol) : null
  const branches = rootType?.isUnion() ? rootType.types : rootType ? [rootType] : []
  const has = (key) => branches.some((t) => checker.getPropertyOfType(t, key))
  const requires = (key) =>
    branches.length > 0 &&
    branches.every((t) => {
      const s = checker.getPropertyOfType(t, key)
      return s && !(s.flags & ts.SymbolFlags.Optional)
    })
  const baseErrors = ts.getPreEmitDiagnostics(p).filter((d) => d.category === ts.DiagnosticCategory.Error)
  const checks = []
  // The `satisfies` expression ensures contextual literal typing. Acceptance
  // of invalid values is conclusive; rejection counts only on known shapes
  // with paired valid witnesses. No result is awarded for excess properties.
  function accepts(label, value, expected) {
    const pp = programFor(dir, `const witness = ${JSON.stringify(value)} satisfies CaseState;\n`)
    const errors = ts.getPreEmitDiagnostics(pp).filter((d) => d.category === ts.DiagnosticCategory.Error)
    const accepted = errors.length === 0
    checks.push({
      label,
      expected,
      accepted,
      passed: expected === null ? null : accepted === expected,
      diagnosticCodes: [...new Set(errors.map((d) => d.code))]
    })
    return accepted
  }
  let status = "unassessed",
    invalidAccepted = 0,
    validFailures = 0
  const common = { displayLabel: "a" }
  const testValid = (label, value) => {
    if (!accepts(label, value, true)) validFailures++
  }
  const testInvalid = (label, value) => {
    if (accepts(label, value, false)) invalidAccepted++
  }
  if (!baseErrors.length && symbol && requires("displayLabel") && !has("label")) {
    if (["context-invoice", "excluded-support"].includes(task.caseId) && has("amountDue")) {
      const duplicate = has("invoiceCurrency")
      for (const currency of ["EUR", "USD"]) {
        const good = {
          ...common,
          amountDue: { minorUnits: 100, currency },
          ...(duplicate ? { invoiceCurrency: currency } : {})
        }
        testValid(`invoice-valid-${currency}`, good)
        if (duplicate)
          testInvalid(`invoice-mismatch-${currency}`, { ...good, invoiceCurrency: currency === "EUR" ? "USD" : "EUR" })
      }
      status = invalidAccepted ? "remaining" : validFailures ? "unassessed" : "repaired"
    } else if (task.caseId === "context-rendering" && has("asset")) {
      const duplicate = has("resolution")
      for (const resolution of ["small", "large"]) {
        const good = { ...common, asset: { rendering: { resolution } }, ...(duplicate ? { resolution } : {}) }
        testValid(`render-valid-${resolution}`, good)
        if (duplicate)
          testInvalid(`render-mismatch-${resolution}`, {
            ...good,
            resolution: resolution === "small" ? "large" : "small"
          })
      }
      status = invalidAccepted ? "remaining" : validFailures ? "unassessed" : "repaired"
    } else if (["local-payment", "clean-payment"].includes(task.caseId) && has("status") && has("receipt")) {
      // A legitimate union may omit receipt on pending; nullable legacy shapes
      // require receipt:null. Find a domain-valid pending witness before testing.
      const pending = { ...common, status: "pending" }
      const pendingAccepted = accepts("payment-pending-absent-alternative", pending, null)
      if (!pendingAccepted) testValid("payment-pending-null", { ...pending, receipt: null })
      testValid("payment-paid-valid", { ...common, status: "paid", receipt: "receipt-1" })
      testInvalid("payment-paid-null", { ...common, status: "paid", receipt: null })
      testInvalid("payment-paid-absent", { ...common, status: "paid" })
      testInvalid("payment-pending-receipt", { ...pending, receipt: "receipt-1" })
      if (task.caseId === "clean-payment") {
        testValid("payment-paid-note", { ...common, status: "paid", receipt: "receipt-1", note: "thanks" })
        testValid("payment-pending-note", { ...pending, ...(pendingAccepted ? {} : { receipt: null }), note: "thanks" })
      }
      status = invalidAccepted
        ? "remaining"
        : validFailures
          ? "unassessed"
          : task.gold === false
            ? "clean-preserved"
            : "repaired"
    } else if (task.caseId === "clean-currencies" && has("quoted") && has("settled")) {
      for (const quoted of ["EUR", "USD"])
        for (const settled of ["EUR", "USD"]) {
          testValid(`independent-${quoted}-${settled}`, {
            ...common,
            quoted: { minorUnits: 100, currency: quoted },
            settled: { minorUnits: 110, currency: settled }
          })
        }
      status = validFailures ? "new-domain-restriction" : "clean-preserved"
    }
  }
  return {
    blindId,
    taskId: task.id,
    caseId: task.caseId,
    sourceDigest: digest(source),
    supportingDigest: fs.existsSync(path.join(dir, "support.ts"))
      ? digest(fs.readFileSync(path.join(dir, "support.ts")))
      : null,
    exported: !!symbol,
    compiles: baseErrors.length === 0,
    diagnosticCodes: [...new Set(baseErrors.map((d) => d.code))],
    presentationRename: requires("displayLabel") && !has("label"),
    underlyingGold: task.caseId === "excluded-support" ? true : task.gold,
    status,
    invalidAccepted,
    validFailures,
    checks,
    limitations:
      status === "unassessed"
        ? "Public shape changed beyond mechanically justified probes, valid domain witnesses failed, rename failed, or code did not compile; no automatic repair credit."
        : "Finite domain witnesses only; not a general proof. Pending missing/null alternatives and removed duplicate fields are treated as legitimate shape choices."
  }
}
if (!process.argv.includes("--score")) {
  process.stdout.write(
    "Prepared blind artifact compiler scorer. Run --score only after all eighteen artifacts exist.\n"
  )
} else {
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((x) => x.isDirectory())
    .map((x) => x.name)
    .sort()
  if (
    dirs.length !== 18 ||
    dirs.some(
      (id) => !fs.existsSync(path.join(root, id, "subject.ts")) || !fs.existsSync(path.join(root, id, "task.json"))
    )
  ) {
    throw new Error("Refusing partial scoring: exactly eighteen complete blind artifacts required.")
  }
  if (fs.existsSync(output)) throw new Error("Frozen blind scores already exist; refusing overwrite.")
  const scores = dirs.map((id) => score(path.join(root, id), id))
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        version: 1,
        scorer: "TypeScript finite-domain probes",
        scorerDigest: digest(fs.readFileSync(new URL(import.meta.url))),
        typescriptVersion: ts.version,
        blinded: true,
        scores
      },
      null,
      2
    ) + "\n",
    { flag: "wx" }
  )
  process.stdout.write(JSON.stringify({ scored: scores.length, output }) + "\n")
}
