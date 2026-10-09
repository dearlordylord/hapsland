import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
const root = resolve(import.meta.dirname, "..")
const owner = resolve(root, "import-policy")
const outputDirectory = resolve(process.argv.slice(2).find((arg) => arg !== "--check") ?? join(root, "dist"))
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).hapsland.toolchain.bend.version
assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(), `bend ${version}`)
const temporary = mkdtempSync(join(tmpdir(), "hapsland-declaration-artifact-"))
try {
  const verdict = execFileSync("bend", [owner + "/PROOF.bend", "--verdict"], { encoding: "utf8", timeout: 5000 })
  assert.ok(verdict.includes("ALL PROOFS CHECK"))
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [owner + "/core.bend", "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const definitions = [
    {
      name: "importReady",
      axes: ["modulePresent", "clausePresent"],
      evaluate: (values) => core.import_ready(...values)
    },
    {
      name: "importNamespaceAdmission",
      axes: ["localPresent", "duplicate"],
      evaluate: (values) => core.namespace_admission(...values)
    },
    {
      name: "importSpecifierAdmission",
      axes: ["importedPresent", "localPresent", "duplicate"],
      evaluate: (values) => core.specifier_admission(...values)
    },
    {
      name: "importTypeOnly",
      axes: ["statementTypeOnly", "specifierTypeOnly"],
      evaluate: (values) => core.type_only(...values)
    }
  ]
  const literal = (value) => (value === undefined ? "undefined" : JSON.stringify(value))
  const choose = (test, yes, no) =>
    yes === no
      ? yes
      : yes === "true" && no === "false"
        ? `(${test})`
        : yes === "false" && no === "true"
          ? `(!(${test}))`
          : no === "false"
            ? `((${test})&&${yes})`
            : yes === "false"
              ? `(!(${test})&&${no})`
              : yes === "true"
                ? `((${test})||${no})`
                : no === "true"
                  ? `(!(${test})||${yes})`
                  : `((${test})?${yes}:${no})`
  const expression = (definition, index = 0, values = []) =>
    index === definition.axes.length
      ? literal(definition.evaluate(values))
      : choose(
          definition.axes[index],
          expression(definition, index + 1, [...values, true]),
          expression(definition, index + 1, [...values, false])
        )
  const nativeReady = expression({
    axes: ["moduleValue !== undefined", "clause !== undefined"],
    evaluate: (values) => core.import_ready(...values)
  })
  const nativeNamespace = expression({
    axes: ["local !== undefined", "imports.has(local)"],
    evaluate: (values) => core.namespace_admission(...values)
  })
  const nativeSpecifier = expression({
    axes: ["imported !== undefined", "local !== undefined", "imports.has(local)"],
    evaluate: (values) => core.specifier_admission(...values)
  })
  const nativeTypeOnly = expression({
    axes: ["/^import\\s+type\\b/u.test(node.text)", "/^type\\b/u.test(specifier.text)"],
    evaluate: (values) => core.type_only(...values)
  })
  const generated =
    definitions
      .map(
        (definition) => `export const ${definition.name}=(${definition.axes.join(",")})=>${expression(definition)};\n`
      )
      .join("") +
    `export const importNativeReady=(moduleValue,clause)=>${nativeReady};\n` +
    `export const importNativeNamespaceAdmission=(local,imports)=>${nativeNamespace};\n` +
    `export const importNativeSpecifierAdmission=(imported,local,imports)=>${nativeSpecifier};\n` +
    `export const importNativeTypeOnly=(node,specifier)=>${nativeTypeOnly};\n`
  const artifact = join(temporary, "specialized.mjs")
  writeFileSync(artifact, generated)
  const api = await import(pathToFileURL(artifact))
  let cases = 0
  for (const definition of definitions)
    for (let bits = 0; bits < 2 ** definition.axes.length; bits++) {
      const values = definition.axes.map((_, axis) => Boolean(bits & (1 << axis)))
      assert.equal(api[definition.name](...values), definition.evaluate(values))
      cases++
    }
  const declaration = readFileSync(join(root, "abi/import-policy.generated.d.ts"), "utf8")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(join(outputDirectory, "import-policy.generated.js"), "utf8"), generated)
    assert.equal(readFileSync(join(outputDirectory, "import-policy.generated.d.ts"), "utf8"), declaration)
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(join(outputDirectory, "import-policy.generated.js"), generated)
    writeFileSync(join(outputDirectory, "import-policy.generated.d.ts"), declaration)
  }
  console.log(
    JSON.stringify({ importSpecializations: cases, mode: process.argv.includes("--check") ? "checked" : "generated" })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
