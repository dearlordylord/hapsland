import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"

const root = dirname(fileURLToPath(import.meta.url))
const digest = (value) => createHash("sha256").update(value).digest("hex")
const sources = new Map()
function collect(path) {
  if (sources.has(path)) return
  const source = readFileSync(path, "utf8")
  sources.set(path, source)
  for (const match of source.matchAll(/^import\s+(\.[^\s]+\.bend)(?:\s|$)/gm)) collect(resolve(dirname(path), match[1]))
}
collect(join(root, "RunExports.bend"))
const sourceHash = digest(
  [...sources]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, source]) => `${relative(root, path)}\0${source}\0`)
    .join("")
)
const buildHash = digest(readFileSync(fileURLToPath(import.meta.url)))
const declarationHash = digest(readFileSync(join(root, "run.d.mts")))
const hostSources = new Map()
function collectHost(path) {
  if (hostSources.has(path)) return
  const source = readFileSync(path, "utf8")
  hostSources.set(path, source)
  for (const match of source.matchAll(/(?:from\s+|import\s*)(["'])(\.[^"']+)\1/g)) {
    const dependency = resolve(dirname(path), match[2])
    // Emitted modules have their own freshness checks; hashing run.mjs here
    // would make its embedded source identity depend on itself.
    if (/\.[cm]?js$/.test(dependency)) continue
    if (!/\.[cm]?tsx?$/.test(dependency)) throw new Error(`Unsupported runner host dependency ${match[2]}`)
    collectHost(dependency)
  }
}
for (const name of ["index.ts", "native-run-host.ts", "native-run-codec.ts"])
  collectHost(join(root, "../monkey-business/src", name))
const hostHash = digest(
  [...hostSources]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, source]) => `${relative(root, path)}\0${source}\0`)
    .join("")
)
const identityHash = digest([sourceHash, buildHash, declarationHash, hostHash].join("\0"))
const outputPath = join(root, "run.mjs")
const manifestPath = join(root, "run.generated.json")
const entries = {
  create: 2,
  enqueue: 3,
  step: 1,
  step_bounded: 4,
  checkpoint_continue: 4,
  advance: 3,
  advance_status: 3,
  advance_step_status: 4,
  observe: 1,
  runtime_snapshot: 1,
  core: 1,
  replace_core: 2,
  replace_runtime: 2,
  default_runtime: 0,
  control: 2,
  configure_cache: 3,
  notice_exercise: 3,
  normalize: 1,
  bind_generated: 3,
  unit_key: 9,
  input_key: 8,
  subject_key: 0
}
if (process.argv.includes("--check")) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  for (const [key, value] of Object.entries({
    sourceHash,
    buildHash,
    declarationHash,
    hostHash,
    identityHash,
    moduleHash: digest(readFileSync(outputPath))
  }))
    if (manifest[key] !== value)
      throw new Error("Stale shared runner artifact; run node packages/monkey-business-bend/build-run.mjs")
} else {
  const temporary = mkdtempSync(join(tmpdir(), "hapsland-run-"))
  try {
    const emittedPath = join(temporary, "run.mjs")
    const result = spawnSync("bend", [join(root, "RunExports.bend"), "-o", emittedPath], {
      encoding: "utf8",
      timeout: 15000
    })
    if (result.error || result.status !== 0) throw result.error ?? new Error(result.stdout + result.stderr)
    const compiled = readFileSync(emittedPath, "utf8")
    const offset = compiled.indexOf("function $0m0(")
    if (offset < 0 || Object.keys(entries).some((name) => !compiled.includes(`function $${name}$(`)))
      throw new Error("Bend runner emitted layout changed")
    const policy = compiled.slice(0, offset).replaceAll("../agent-flow-bend/", "").replaceAll("./", "")
    const wrappers = Object.entries(entries)
      .map(([name, arity]) => {
        const args = Array.from({ length: arity }, (_, index) => `a${index}`)
        const input = args.map((arg, index) => (name !== "create" && index === 0 ? arg : `facts(${arg})`))
        return `${JSON.stringify(name)}: (${args.join(",")}) => run_loop($${name}$(${input.join(",")}))`
      })
      .join(",\n")
    const module = `${policy}\nexport const SOURCE_IDENTITY = "shared-monkey-business-runner-sha256:${identityHash}";\nconst facts = value => {\n  if (typeof value === "bigint") { if (value < 0n || value >= 281474976710656n) throw new RangeError("invalid immediate Nat"); return Number(value); }\n  if (typeof value === "number") { if (!Number.isSafeInteger(value) || value < 0 || value >= 281474976710656) throw new RangeError("invalid immediate Nat"); return value; }\n  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key,item]) => [key, key === "$" && typeof item === "string" ? item.replaceAll("../agent-flow-bend/", "").replaceAll("./", "") : facts(item)]));\n  return value;\n};\nexport default {\n${wrappers}\n};\n`
    writeFileSync(outputPath, module)
    writeFileSync(
      manifestPath,
      JSON.stringify(
        { sourceHash, buildHash, declarationHash, hostHash, identityHash, moduleHash: digest(module) },
        null,
        2
      ) + "\n"
    )
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}
