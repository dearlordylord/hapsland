import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { maskBendSource } from "../packages/source-analysis/src/direct-event/languages/bend/lexical.ts"
import { fileEvidence } from "./compiler-evidence.mjs"

const sha256 = (source) => createHash("sha256").update(source, "utf8").digest("hex")

const namespacePrefixes = (clean) => {
  const names = new Set()
  let datatype = false
  for (const line of clean.split(/\r?\n/u)) {
    const binding =
      /^(?:@unsafe\s+)?(type|def|law)\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)(?=[<(:?\s]|$)/u.exec(line)
    if (binding !== null) {
      names.add(binding[2].split(".")[0])
      datatype = binding[1] === "type"
    } else if (line.trim() !== "" && !/^\s/u.test(line)) datatype = false
    const constructor = datatype ? /^  ([A-Za-z_][A-Za-z0-9_]*)\{/u.exec(line) : null
    if (constructor !== null) names.add(constructor[1])
  }
  return [...names].sort()
}

/** Select exact compiler-owned bytes; presentation never supplies a replacement declaration. */
export const deriveBendBaseEvidence = (source, compiler) => {
  const clean = maskBendSource(source, true)
  const headers = [...clean.matchAll(/^type List(?:<[^\r\n]*>)? is [^:\r\n]+:[ \t]*$/gm)]
  if (headers.length !== 1) throw new Error("Expected exactly one compiler Base List declaration")
  const header = headers[0]
  const remaining = clean.slice(header.index + header[0].length)
  const body = /^(?:\r?\n  [A-Za-z_][A-Za-z0-9_]*\{[^{}\r\n]*\}[ \t]*)+/u.exec(remaining)
  if (body === null) throw new Error("Unsupported compiler Base List declaration body")
  const end = header.index + header[0].length + body[0].length
  if (!/^(?:\r?\n(?:[ \t]*\r?\n)*[^ \t\r\n]|[ \t\r\n]*$)/u.test(clean.slice(end)))
    throw new Error("Unsupported continuation of compiler Base List declaration")
  const declaration = source.slice(header.index, end)
  return {
    library: "bend/Base",
    compilerVersion: compiler.version,
    compilerSource: compiler.source,
    moduleHash: sha256(source),
    namespacePrefixes: namespacePrefixes(clean),
    declarations: [{ name: "List", source: declaration, sourceHash: sha256(declaration) }]
  }
}

/** Build checks use the already observed toolchain; only the explicit generator writes source. */
export const generateBendBaseEvidence = (root, toolchain, check = false) => {
  if (toolchain === undefined) throw new Error("Bundled Bend evidence requires the selected compiler toolchain")
  const basePath = resolve(root, toolchain.base.path)
  const before = fileEvidence(root, basePath)
  if (before.sha256 !== toolchain.base.sha256) throw new Error("Bend Base changed after toolchain selection")
  const model = deriveBendBaseEvidence(readFileSync(basePath, "utf8"), toolchain.cohort.bend)
  const after = fileEvidence(root, basePath)
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Bend Base changed during evidence generation")
  const path = resolve(
    root,
    "packages/source-analysis/src/direct-event/languages/bend/base-declarations.generated.json"
  )
  const content = `${JSON.stringify(model, null, 2)}\n`
  if (check) {
    if (readFileSync(path, "utf8") !== content)
      throw new Error(`Stale bundled Bend evidence: ${relative(root, path)}; run npm run bend:base:generate`)
  } else writeFileSync(path, content)
  return model
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || !["--update", "--check"].includes(process.argv[2]))
    throw new Error("Usage: generate-bend-base-evidence.mjs --update|--check")
  const root = resolve(import.meta.dirname, "..")
  const { bendProducerToolchain } = await import("./bend-producer.mjs")
  const { withBuildLock } = await import("./build-lock.mjs")
  await withBuildLock(root, async () =>
    generateBendBaseEvidence(root, await bendProducerToolchain(root), process.argv[2] === "--check")
  )
}
