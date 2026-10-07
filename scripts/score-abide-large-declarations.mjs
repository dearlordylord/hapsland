// Research scoring retains the classic TypeScript 5.9.3 compiler API; production uses TypeScript 7.
import ts from "@hapsland/scorer-typescript"
// Independent anonymous finite-contract oracle; never reads reviewer ledgers.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import { tmpdir } from "node:os"

const hash = (data) => crypto.createHash("sha256").update(data).digest("hex")
const arg = (name) => process.argv.find((x) => x.startsWith(name + "="))?.slice(name.length + 1)
const defaultFixtures = new URL("./abide-large-declaration-fixtures.mjs", import.meta.url)
const options = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  types: []
}
const structuralCodes = new Set([2307, 2305, 2304, 2694, 2536])
const domainKeys = {
  "report-delivery": new Set(["delivery", "deliveryMode", "recipients"]),
  "map-camera": new Set(["center", "centerLatitude", "centerLongitude"]),
  "render-pool": new Set(["workerCount"])
}
const equalPrelude =
  "type Equal<A,B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false; type Assert<T extends true> = T;"
// Only immutable compiler-library ASTs are reused; every submitted source and
// probe is parsed afresh, so a preceding witness cannot contaminate a verdict.
const librarySources = new Map()
const libraryDirectory = path.dirname(ts.getDefaultLibFilePath(options))

function programFor(dir, probe = "") {
  const file = path.join(dir, "__independent_probe.ts"),
    host = ts.createCompilerHost(options)
  const read = host.readFile.bind(host),
    exists = host.fileExists.bind(host)
  host.readFile = (p) => (p === file ? probe : read(p))
  host.fileExists = (p) => p === file || exists(p)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (name, ...args) => {
    if (path.dirname(name) !== libraryDirectory || !/^lib\..*\.d\.ts$/.test(path.basename(name)))
      return getSourceFile(name, ...args)
    if (!librarySources.has(name)) librarySources.set(name, getSourceFile(name, ...args))
    return librarySources.get(name)
  }
  return ts.createProgram([path.join(dir, "subject.ts"), file], options, host)
}
const errors = (p) => ts.getPreEmitDiagnostics(p).filter((d) => d.category === ts.DiagnosticCategory.Error)

function originalFields(fixture) {
  const sf = ts.createSourceFile("original.ts", fixture.after, ts.ScriptTarget.ES2022, true)
  const state = sf.statements.find((n) => ts.isInterfaceDeclaration(n) && n.name.text === "CaseState")
  assert(state, "Automated domains require a frozen interface reference")
  return state.members
    .filter(ts.isPropertySignature)
    .map((n) => ({
      name: n.name.getText(sf).replace(/^['"]|['"]$/g, ""),
      type: n.type.getText(sf),
      optional: !!n.questionToken
    }))
}

function valueFor(type, second) {
  if (type === "string") return second ? "arbitraryText" : '"example"'
  if (type === "boolean") return second ? "true" : "false"
  if (type === "readonly string[]")
    return second ? '[arbitraryText, "another"] as readonly string[]' : "[] as readonly string[]"
  const literals = [...type.matchAll(/"([^"]+)"/g)].map((m) => JSON.stringify(m[1]))
  assert(literals.length && literals.length === type.split("|").length, `Unsupported independent type: ${type}`)
  return literals[second ? literals.length - 1 : 0]
}

function commonExpression(fields, second) {
  return "{" + fields.map((f) => `${JSON.stringify(f.name)}: ${valueFor(f.type, second)}`).join(", ") + "}"
}

function declarationView(p, dir) {
  const checker = p.getTypeChecker(),
    sf = p.getSourceFile(path.join(dir, "subject.ts"))
  const module = sf && checker.getSymbolAtLocation(sf)
  const state = module && checker.getExportsOfModule(module).find((s) => s.name === "CaseState")
  const signatures = state ? checker.getTypeOfSymbolAtLocation(state, sf).getCallSignatures() : []
  const callable = signatures.length > 0
  const type = state && checker.getDeclaredTypeOfSymbol(state)
  const branches = type ? (type.isUnion() ? type.types : [type]) : []
  const has = (key) => branches.some((b) => checker.getPropertyOfType(b, key))
  const rename = callable
    ? signatures.every(
        (s) => s.parameters.some((p) => p.name === "displayLabel") && !s.parameters.some((p) => p.name === "label")
      )
    : branches.length > 0 &&
      branches.every((b) => {
        const s = checker.getPropertyOfType(b, "displayLabel")
        return s && !(s.flags & ts.SymbolFlags.Optional) && !checker.getPropertyOfType(b, "label")
      })
  return { checker, branches, has, rename, callable }
}

function typeGuard(fields) {
  return (
    'import type { CaseState } from "./subject.js";\n' +
    equalPrelude +
    "\n" +
    fields
      .map((f, i) => {
        const k = JSON.stringify(f.name),
          original = `{ ${k}${f.optional ? "?" : ""}: ${f.type} }`
        return `type Guard${i} = Assert<Equal<Pick<CaseState, ${k}>, ${original}>>;`
      })
      .join("\n")
  )
}

function domainWitnesses(id, has) {
  if (id === "report-delivery") {
    const wrap = (x) => (has("delivery") ? `{ delivery: ${x} }` : x.replace("mode:", "deliveryMode:"))
    if (!has("delivery") && !has("deliveryMode")) return null
    return [
      [wrap('{ mode: "download" }'), true, "download"],
      [wrap('{ mode: "email", recipients: [arbitraryText] as [string, ...string[]] }'), true, "email-one"],
      [wrap('{ mode: "email", recipients: [arbitraryText, "second"] as [string, ...string[]] }'), true, "email-many"],
      [
        wrap('{ mode: "download", recipients: [arbitraryText] as [string, ...string[]] }'),
        false,
        "download-with-recipients"
      ],
      [wrap('{ mode: "email" }'), false, "email-without-recipients"],
      [wrap('{ mode: "email", recipients: [] as [] }'), false, "email-empty-recipients"]
    ]
  }
  if (id === "map-camera") {
    const nested = has("center")
    if (!nested && !has("centerLatitude") && !has("centerLongitude")) return null
    return [
      ["{}", true, "no-center"],
      [
        nested
          ? "{ center: { latitude: arbitraryNumber, longitude: otherNumber } }"
          : "{ centerLatitude: arbitraryNumber, centerLongitude: otherNumber }",
        true,
        "full-center"
      ],
      [
        nested ? "{ center: { latitude: 0, longitude: -12.5 } }" : "{ centerLatitude: 0, centerLongitude: -12.5 }",
        true,
        "zero-and-fractional-center"
      ],
      [
        nested ? "{ center: { latitude: arbitraryNumber } }" : "{ centerLatitude: arbitraryNumber }",
        false,
        "latitude-only"
      ],
      [nested ? "{ center: { longitude: otherNumber } }" : "{ centerLongitude: otherNumber }", false, "longitude-only"]
    ]
  }
  if (id === "render-pool") {
    if (!has("workerCount")) return null
    return [1, 2, 4, 0, -1.5, 8].map((n) => [`{ workerCount: ${n} }`, [1, 2, 4].includes(n), `workers-${n}`])
  }
  return null
}

function witnessCode(common, value) {
  // Explicit property literal inference is retained by a const generic; arrays
  // deliberately retain their declared tuple/container types. Assignment through
  // a variable tests structural acceptance, rather than fresh excess properties.
  return `import type { CaseState } from "./subject.js";
declare const arbitraryText: string; declare const arbitraryNumber: number; declare const otherNumber: number;
function literal<const T>(value: T): T { return value; }
const common = literal(${common}); const relevant = literal(${value});
const witness = { ...common, ...relevant }; const checked: CaseState = witness;`
}

export async function score(dir, blindId, cases) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "task.json")))
  const fixture = cases.find((c) => c.id === meta.caseId)
  assert(fixture, "Unknown exact caseId in anonymous task")
  const p = programFor(dir),
    diagnostics = errors(p),
    view = declarationView(p, dir),
    checks = []
  const base = {
    blindId,
    caseId: fixture.id,
    candidateId: fixture.candidateId,
    ruleId: fixture.ruleId,
    layout: fixture.layout,
    sourceDigest: hash(fs.readFileSync(path.join(dir, "subject.ts"))),
    supportingDigest: hash(
      fs.existsSync(path.join(dir, "support.ts")) ? fs.readFileSync(path.join(dir, "support.ts")) : ""
    ),
    compiles: !diagnostics.length,
    presentationRename: !!view.rename,
    underlyingGold: fixture.gold,
    diagnosticCodes: [...new Set(diagnostics.map((d) => d.code))]
  }
  let status = "unassessed",
    validFailures = 0,
    invalidAccepted = 0
  const manual = !domainKeys[fixture.candidateId]
  if (base.compiles && base.presentationRename && manual) status = "manual-adjudication-required"
  if (base.compiles && base.presentationRename && !manual) {
    const fields = originalFields(fixture).filter((f) => !domainKeys[fixture.candidateId].has(f.name))
    const guardErrors = errors(programFor(dir, typeGuard(fields)))
    checks.push({
      label: "all-independent-facts-preserved",
      expected: true,
      accepted: guardErrors.length === 0,
      passed: guardErrors.length === 0,
      diagnosticCodes: [...new Set(guardErrors.map((d) => d.code))]
    })
    const relevant = domainWitnesses(fixture.candidateId, view.has)
    if (!guardErrors.length && relevant) {
      for (const second of [false, true])
        for (const [value, accepted, label] of relevant) {
          const ds = errors(programFor(dir, witnessCode(commonExpression(fields, second), value)))
          const actual = !ds.length,
            structuralError = ds.some((d) => structuralCodes.has(d.code))
          checks.push({
            label: `${label}-${second ? "alternate" : "initial"}`,
            expected: accepted,
            accepted: actual,
            passed: actual === accepted && !structuralError,
            structuralError,
            diagnosticCodes: [...new Set(ds.map((d) => d.code))]
          })
          if (accepted && !actual) validFailures++
          if (!accepted && actual) invalidAccepted++
        }
      const unknown = checks.some((c) => c.structuralError)
      status = unknown
        ? "unassessed"
        : validFailures
          ? fixture.gold
            ? "unassessed"
            : "new-domain-restriction"
          : invalidAccepted
            ? fixture.gold
              ? "remaining"
              : "new-domain-restriction"
            : fixture.gold
              ? "repaired"
              : "clean-preserved"
    }
  }
  return {
    ...base,
    status,
    validFailures,
    invalidAccepted,
    checks,
    limitations: manual
      ? "Predeclared blinded manual adjudication required: duplicate counts may be computed/removed, and callable dependency contracts require concrete behavioral probes. No automatic repair credit."
      : "Finite assignment witnesses plus exact independent-field preservation. Dynamic strings/numbers prevent witness-literal narrowing; unknown public representations remain unassessed. No superficial source text or reviewer wording credit."
  }
}

function writeFixture(dir, fixture, source) {
  fs.writeFileSync(path.join(dir, "subject.ts"), source)
  fs.writeFileSync(path.join(dir, "task.json"), JSON.stringify({ caseId: fixture.id }))
  fs.writeFileSync(path.join(dir, "support.ts"), fixture.support?.["support.ts"] ?? "")
}

export async function selfCheck(cases) {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "large-oracle-"))
  let assertions = 0
  const assertStatus = async (fixture, source, expected, label) => {
    writeFixture(dir, fixture, source)
    const s = await score(dir, label, cases)
    assert.equal(s.status, expected, `${fixture.id}: ${label}`)
    assertions++
  }
  try {
    for (const fixture of cases) {
      const manual = !domainKeys[fixture.candidateId]
      await assertStatus(
        fixture,
        fixture.after,
        manual ? "manual-adjudication-required" : fixture.gold ? "remaining" : "clean-preserved",
        "original"
      )
      if (manual) {
        // Neither deleted data nor deleted behavior gets automatic repair credit.
        // Frozen semantic adjudication, not this deliberately conservative gate,
        // is responsible for rejecting these destructive candidates.
        const destructive =
          fixture.ruleId === "r9_body_reaches_undeclared"
            ? 'export function CaseState(displayLabel: string): never { throw new Error("operation removed"); }'
            : "export interface CaseState { displayLabel: string }"
        await assertStatus(fixture, destructive, "manual-adjudication-required", "deleted-facts-or-behavior")
        continue
      }
      const clean = cases.find((c) => c.candidateId === fixture.candidateId && c.layout === fixture.layout && !c.gold)
      assert(clean, "Missing matched clean reference")
      await assertStatus(fixture, clean.after, fixture.gold ? "repaired" : "clean-preserved", "canonical-repair")
      await assertStatus(
        fixture,
        "export interface CaseState { displayLabel: string }",
        "unassessed",
        "all-facts-deleted"
      )
      const fields = originalFields(fixture).filter((f) => !domainKeys[fixture.candidateId].has(f.name))
      const independent = fields.map((f) => `${JSON.stringify(f.name)}${f.optional ? "?" : ""}: ${f.type};`).join("\n")
      if (fixture.candidateId === "report-delivery") {
        const alternative = `export type CaseState = { ${independent} } & ({ deliveryMode: "download"; recipients?: never } | { deliveryMode: "email"; recipients: [string, ...string[]] });`
        await assertStatus(
          fixture,
          alternative,
          fixture.gold ? "repaired" : "clean-preserved",
          "flat-tagged-union-repair"
        )
      }
      if (fixture.candidateId === "map-camera") {
        const alternative = `export type CaseState = { ${independent} } & ({ centerLatitude?: never; centerLongitude?: never } | { centerLatitude: number; centerLongitude: number });`
        await assertStatus(
          fixture,
          alternative,
          fixture.gold ? "repaired" : "clean-preserved",
          "flat-complete-or-absent-repair"
        )
      }
      for (const f of fields.filter((f) => f.name !== "displayLabel")) {
        const line = new RegExp(`^\\s*${f.name}\\??:[^\\n]+\\n`, "m")
        const deleted = clean.after.replace(line, "")
        assert.notEqual(deleted, clean.after)
        await assertStatus(fixture, deleted, "unassessed", `deleted-${f.name}`)
      }
      await assertStatus(
        fixture,
        clean.after.replace("displayLabel: string", 'displayLabel: "example"'),
        "unassessed",
        "hardcoded-label"
      )
      if (fixture.candidateId === "render-pool")
        await assertStatus(
          fixture,
          clean.after.replace("workerCount: 1 | 2 | 4", "workerCount: 1"),
          fixture.gold ? "unassessed" : "new-domain-restriction",
          "lost-pool-options"
        )
      if (fixture.candidateId === "map-camera")
        await assertStatus(
          fixture,
          clean.after.replace("latitude: number", "latitude: 0"),
          fixture.gold ? "unassessed" : "new-domain-restriction",
          "hardcoded-coordinate"
        )
      if (fixture.candidateId === "report-delivery")
        await assertStatus(
          fixture,
          clean.after.replace(/\[string, \.\.\.string\[\]\]/g, '["reader@example.org", ..."reader@example.org"[]]'),
          fixture.gold ? "unassessed" : "new-domain-restriction",
          "hardcoded-recipient"
        )
    }
    fs.writeFileSync(path.join(dir, "task.json"), JSON.stringify({ caseId: "suffix-collision-" + cases[0].id }))
    await assert.rejects(() => score(dir, "invalid-id", cases), /Unknown exact caseId/)
    assertions++
    return { selfCheckPassed: true, assertions, cases: cases.length, typescriptVersion: ts.version }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

if (process.argv.includes("--score") || process.argv.includes("--self-check")) {
  const moduleURL = arg("--fixtures") ? pathToFileURL(path.resolve(arg("--fixtures"))) : defaultFixtures
  const { cases } = await import(moduleURL.href)
  if (process.argv.includes("--self-check")) console.log(JSON.stringify(await selfCheck(cases)))
  else {
    const root = path.resolve(arg("--blind-root")),
      output = path.resolve(arg("--output"))
    const dirs = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((x) => x.isDirectory())
      .map((x) => x.name)
      .sort()
    assert.equal(dirs.length, Number(arg("--expected-count") ?? 72), "Refuse partial scoring")
    assert(!fs.existsSync(output), "Never overwrite frozen scores")
    const scores = []
    for (const id of dirs) scores.push(await score(path.join(root, id), id, cases))
    fs.writeFileSync(
      output,
      JSON.stringify(
        {
          version: 1,
          blinded: true,
          scorerDigest: hash(fs.readFileSync(import.meta.filename)),
          fixtureDigest: hash(fs.readFileSync(moduleURL)),
          typescriptVersion: ts.version,
          scores
        },
        null,
        2
      ) + "\n",
      { flag: "wx" }
    )
    console.log(JSON.stringify({ scored: scores.length, output }))
  }
}
