import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
const root = resolve(import.meta.dirname, "..")
const owner = resolve(root, "declaration-policy")
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
  const kinds = { Interface: "interface", TypeAlias: "type-alias", Ignore: undefined }
  const definitions = [
    {
      name: "declarationFunctionAdmission",
      axes: ["identifier", "body", "functionConflict", "importConflict", "otherConflict"],
      evaluate: (values) => core.function_admission(...values)
    },
    {
      name: "declarationArrowAdmission",
      axes: ["functionConflict", "importConflict", "otherConflict"],
      evaluate: (values) => core.arrow_admission(...values)
    },
    {
      name: "declarationTypeAdmission",
      axes: ["identifier", "typeConflict", "importConflict"],
      evaluate: (values) => core.type_admission(...values)
    },
    {
      name: "declarationTypeKind",
      axes: ["interfaceSyntax", "aliasSyntax"],
      evaluate: (values) => kinds[core.type_kind(...values).$]
    },
    {
      name: "declarationRootResult",
      axes: ["collectionSucceeded", "limitExceeded"],
      evaluate: (values) => core.root_result(...values).$
    },
    {
      name: "declarationCollectionFailed",
      axes: ["collectionSucceeded"],
      evaluate: (values) => core.root_result(values[0], false).$ !== "Complete"
    },
    {
      name: "declarationLimitFailure",
      axes: ["limitExceeded"],
      evaluate: (values) => core.root_result(false, values[0]).$ === "DeclarationLimit"
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
  const nativeFunction = expression({
    axes: [
      "identifier !== undefined",
      "body !== undefined",
      "state.functions.has(identifier.text)",
      "state.imports.has(identifier.text)",
      "state.otherTopLevelBindings.has(identifier.text)"
    ],
    evaluate: (values) => core.function_admission(...values)
  })
  const nativeArrow = expression({
    axes: ["state.functions.has(name)", "state.imports.has(name)", "state.otherTopLevelBindings.has(name)"],
    evaluate: (values) => core.arrow_admission(...values)
  })
  const nativeType = expression({
    axes: ["identifier !== undefined", "state.types.has(identifier.text)", "state.imports.has(identifier.text)"],
    evaluate: (values) => core.type_admission(...values)
  })
  const nativeKind = expression({
    axes: ['node.type === "interface_declaration"', 'node.type === "type_alias_declaration"'],
    evaluate: (values) => kinds[core.type_kind(...values).$]
  })
  const generated =
    definitions
      .map(
        (definition) => `export const ${definition.name}=(${definition.axes.join(",")})=>${expression(definition)};\n`
      )
      .join("") +
    `export const declarationNativeFunctionAdmission=(identifier,body,state)=>${nativeFunction};\n` +
    `export const declarationNativeArrowAdmission=(name,state)=>${nativeArrow};\n` +
    `export const declarationNativeTypeAdmission=(identifier,state)=>${nativeType};\n` +
    `export const declarationNativeTypeKind=(node)=>${nativeKind};\n`
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
  const declaration = readFileSync(join(root, "abi/declaration-policy.generated.d.ts"), "utf8")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(join(outputDirectory, "declaration-policy.generated.js"), "utf8"), generated)
    assert.equal(readFileSync(join(outputDirectory, "declaration-policy.generated.d.ts"), "utf8"), declaration)
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(join(outputDirectory, "declaration-policy.generated.js"), generated)
    writeFileSync(join(outputDirectory, "declaration-policy.generated.d.ts"), declaration)
  }
  console.log(
    JSON.stringify({
      declarationSpecializations: cases,
      mode: process.argv.includes("--check") ? "checked" : "generated"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
