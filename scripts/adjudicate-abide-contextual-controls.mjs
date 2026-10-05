// Supplemental blind adjudication for explicitly named independent requested facts.
// Original scores remain immutable. Does not inspect arm ledgers or change flaw repair credit.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
const ts = createRequire(import.meta.url)("/tmp/hapsland-quality-scorer/node_modules/typescript")
const root = path.resolve(
  process.argv[2] ?? path.resolve(import.meta.dirname, "../../hapsland-research/evidence/abide-contextual-confirmation")
)
const read = (p) => JSON.parse(fs.readFileSync(p)),
  hash = (b) => crypto.createHash("sha256").update(b).digest("hex")
const declaration = read(path.join(root, "declaration.json")),
  amendment = read(path.join(root, "adjudication-amendment.json"))
assert.equal(hash(fs.readFileSync(import.meta.filename)), amendment.adjudicatorSha256)
const output = path.join(root, "control-adjudication.json")
assert(!fs.existsSync(output))
const options = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  types: [],
  skipLibCheck: true
}
function program(dir, probe = "") {
  const p = path.join(dir, "__control_probe.ts"),
    host = ts.createCompilerHost(options),
    read = host.readFile.bind(host),
    exists = host.fileExists.bind(host)
  host.readFile = (f) => (f === p ? 'import type {CaseState} from "./subject.js";\n' + probe : read(f))
  host.fileExists = (f) => f === p || exists(f)
  return ts.createProgram([path.join(dir, "subject.ts"), p], options, host)
}
const domains = {
  "clean-audio-resampling": {
    root: "track",
    names: ["sampleRate", "requestedSampleRate"],
    values: [44100, 48000],
    nested: (v, a) => ({ encoding: { sampleRate: v, channels: a } })
  },
  "clean-storage-repack": {
    root: "block",
    names: ["compression", "requestedCompression"],
    values: ["none", "zstd"],
    nested: (v, a) => ({ wire: { compression: v, generation: a } })
  }
}
const rows = []
for (const repeat of declaration.repeats) {
  const dir = path.join(root, repeat),
    scores = read(path.join(dir, "blind-scores.json"))
  assert.equal(scores.scores.length, 18)
  for (const score of scores.scores.filter((s) => !s.underlyingGold)) {
    const domain = domains[score.caseId]
    assert(domain)
    const artifact = path.join(dir, "blind", score.blindId),
      p = program(artifact),
      checker = p.getTypeChecker(),
      sf = p.getSourceFile(path.join(artifact, "subject.ts")),
      mod = checker.getSymbolAtLocation(sf),
      symbol = mod && checker.getExportsOfModule(mod).find((s) => s.name === "CaseState"),
      type = symbol && checker.getDeclaredTypeOfSymbol(symbol),
      branches = type ? (type.isUnion() ? type.types : [type]) : []
    const requires = (key) =>
      branches.length > 0 &&
      branches.every((b) => {
        const s = checker.getPropertyOfType(b, key)
        return s && !(s.flags & ts.SymbolFlags.Optional)
      })
    const fields = domain.names.filter(requires),
      baseErrors = ts.getPreEmitDiagnostics(p).filter((d) => d.category === ts.DiagnosticCategory.Error),
      checks = []
    let status = "unassessed"
    if (!baseErrors.length && requires("displayLabel") && requires(domain.root) && fields.length === 1) {
      const field = fields[0]
      for (const native of domain.values)
        for (const aux of [1, 2])
          for (const requested of domain.values) {
            const value = { displayLabel: "a", [domain.root]: domain.nested(native, aux), [field]: requested }
            const pp = program(
              artifact,
              `const witness = ${JSON.stringify(value)} as const;\nconst checked:CaseState=witness;`
            )
            const errors = ts.getPreEmitDiagnostics(pp).filter((d) => d.category === ts.DiagnosticCategory.Error)
            checks.push({
              native,
              auxiliary: aux,
              requested,
              accepted: errors.length === 0,
              diagnosticCodes: [...new Set(errors.map((d) => d.code))]
            })
          }
      status = checks.every((c) => c.accepted) ? "clean-preserved" : "new-domain-restriction"
    }
    rows.push({
      repeat,
      blindId: score.blindId,
      caseId: score.caseId,
      originalStatus: score.status,
      status,
      independentField: fields.length === 1 ? fields[0] : null,
      sourceDigest: score.sourceDigest,
      checks
    })
  }
}
assert.equal(rows.length, 18)
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      blinded: true,
      adjudicatorSha256: amendment.adjudicatorSha256,
      primaryScoresUnchanged: true,
      scope:
        "Only independent requested-fact controls, canonical name or explicit requested-prefixed rename. Applies to every arm. No changes to flawed-case repair scores.",
      rows
    },
    null,
    2
  ) + "\n",
  { flag: "wx" }
)
console.log(
  JSON.stringify({
    controls: rows.length,
    preserved: rows.filter((r) => r.status === "clean-preserved").length,
    resolved: rows.filter((r) => r.originalStatus === "unassessed" && r.status === "clean-preserved").length,
    output
  })
)
