import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
const root = resolve(import.meta.dirname, "..")
const outputDirectory = resolve(process.argv.slice(2).find((arg) => arg !== "--check") ?? join(root, "dist"))
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).hapsland.toolchain.bend.version
assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(), `bend ${version}`)
const temporary = mkdtempSync(join(tmpdir(), "hapsland-reference-artifact-"))
try {
  const verdict = execFileSync("bend", [root + "/reference-policy/PROOF.bend", "--verdict"], {
    encoding: "utf8",
    timeout: 5000
  })
  assert.ok(verdict.includes("ALL PROOFS CHECK"))
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [root + "/reference-policy/core.bend", "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const definitions = [
    {
      name: "referenceCallPlan",
      axes: ["call", "callee", "identifier", "uncertain", "local"],
      evaluate: (values) => plans[core.call_reference(...values).$]
    },
    {
      name: "referenceIgnoredValue",
      axes: ["self", "parent", "declaration", "first"],
      evaluate: (values) => core.ignored_value(...values)
    },
    {
      name: "referenceValuePlan",
      axes: ["local", "known", "uncertain"],
      evaluate: (values) => plans[core.value_reference(...values).$]
    },
    {
      name: "referenceDeclaredType",
      axes: ["intrinsic", "imported"],
      evaluate: (values) => core.declared_type(...values)
    },
    {
      name: "referenceReadonlyIntrinsic",
      axes: ["name", "bound", "generic", "first", "one"],
      evaluate: (values) => core.readonly_intrinsic(...values)
    },
    {
      name: "referenceTypePlan",
      axes: ["unsupported", "identifier", "own", "context", "parameter", "readonly", "declared"],
      evaluate: (values) => plans[core.type_reference(...values).$]
    },
    {
      name: "referenceCallNeedsCallee",
      axes: ["call"],
      evaluate: (values) => core.call_reference(values[0], true, true, false, false).$ !== "Ignore"
    },
    {
      name: "referenceCallNeedsScope",
      axes: ["identifier"],
      evaluate: (values) => core.call_reference(true, true, values[0], false, false).$ === "NamedFunction"
    },
    {
      name: "referenceCallNeedsLocal",
      axes: ["uncertain"],
      evaluate: (values) => core.call_reference(true, true, true, values[0], false).$ === "NamedFunction"
    },
    {
      name: "referenceCallSupported",
      axes: ["local"],
      evaluate: (values) => core.call_reference(true, true, true, false, values[0]).$ === "NamedFunction"
    },
    {
      name: "referenceCallFinish",
      axes: ["supported"],
      evaluate: (values) => plans[core.call_reference(true, true, values[0], false, false).$]
    },
    {
      name: "referenceIgnoreSelf",
      axes: ["self"],
      evaluate: (values) => core.ignored_value(values[0], true, false, false)
    },
    { name: "referenceIgnoreMissingParent", axes: [], evaluate: () => core.ignored_value(false, false, false, false) },
    {
      name: "referenceIgnoreNeedsFirst",
      axes: ["declaration"],
      evaluate: (values) => core.ignored_value(false, true, values[0], true)
    },
    {
      name: "referenceIgnoreFirst",
      axes: ["first"],
      evaluate: (values) => core.ignored_value(false, true, true, values[0])
    }
  ]
  const plans = {
    Ignore: undefined,
    NamedFunction: "named-function",
    NamedType: "named-type",
    Unsupported: "unsupported"
  }
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
  const declaredDefinition = definitions.find((definition) => definition.name === "referenceDeclaredType")
  const nativeDeclared = expression(declaredDefinition)
    .replace(/\bintrinsic\b/g, "intrinsicTypes.has(name)")
    .replace(/\bimported\b/g, "importedNames.has(name)")
  const typeDefinition = definitions.find((definition) => definition.name === "referenceTypePlan")
  const typeAxes = [
    'child.type === "type_identifier"',
    "child.text === ownName",
    "namedTypeContext(child)",
    "parameters.has(child.text)",
    "intrinsicReadonly(child, importedNames)",
    "declaredTypeName(child.text, importedNames)"
  ]
  const typeAccepted = expression({
    axes: typeAxes,
    evaluate: (values) => core.type_reference(false, ...values).$ === "NamedType"
  })
  const nativeType = `(unsupportedTypes.has(child.type)?${JSON.stringify(plans[core.type_reference(true, false, false, false, false, false, false).$])}:(${typeAccepted}?"named-type":undefined))`
  const valueDefinition = definitions.find((definition) => definition.name === "referenceValuePlan")
  const valueAccepted = expression({
    axes: ["valueFunctions.has(child.text)", "scope.uncertainBinding"],
    evaluate: (values) => core.value_reference(false, ...values).$ === "NamedFunction"
  })
  const nativeValue = `(scope.localBindings.has(child.text)?undefined:(${valueAccepted}?"named-function":"unsupported"))`
  const readonlyDefinition = definitions.find((definition) => definition.name === "referenceReadonlyIntrinsic")
  const nativeReadonly = expression({
    ...readonlyDefinition,
    axes: [
      'node.text === "Readonly"',
      "boundTypes.has(node.text)",
      'parent?.type === "generic_type"',
      "sameSyntaxNode(parent.namedChildren[0], node)",
      'parent.namedChildren.find((child)=>child.type === "type_arguments")?.namedChildren.length === 1'
    ]
  })
  const generated =
    definitions
      .map(
        (definition) => `export const ${definition.name}=(${definition.axes.join(",")})=>${expression(definition)};\n`
      )
      .join("") +
    `export const bindReferenceDeclaredType=(intrinsicTypes)=>(name,importedNames)=>${nativeDeclared};\n` +
    `export const bindReferenceTypePlan=(unsupportedTypes,namedTypeContext,intrinsicReadonly,declaredTypeName)=>(child,ownName,parameters,importedNames)=>${nativeType};\n` +
    `export const referenceNativeValuePlan=(child,scope,valueFunctions)=>${nativeValue};\n` +
    `export const bindReferenceReadonly=(sameSyntaxNode)=>(node,boundTypes)=>{const parent=node.parent;return ${nativeReadonly}};\n`
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
  for (const intrinsic of [false, true])
    for (const imported of [false, true]) {
      const reads = []
      const bound = api.bindReferenceDeclaredType({
        has: (name) => {
          assert.equal(name, "X")
          reads.push("intrinsic")
          return intrinsic
        }
      })
      assert.equal(
        bound("X", {
          has: (name) => {
            assert.equal(name, "X")
            reads.push("imported")
            return imported
          }
        }),
        core.declared_type(intrinsic, imported)
      )
      assert.deepEqual(reads, intrinsic ? ["intrinsic", "imported"] : ["intrinsic"])
    }
  for (let bits = 0; bits < 128; bits++) {
    const values = Array.from({ length: 7 }, (_, axis) => Boolean(bits & (1 << axis)))
    const [unsupported, identifier, own, context, parameter, readonly, declared] = values
    const bound = api.bindReferenceTypePlan(
      { has: () => unsupported },
      () => context,
      () => readonly,
      () => declared
    )
    assert.equal(
      bound(
        { type: identifier ? "type_identifier" : "other", text: "X" },
        own ? "X" : "Y",
        { has: () => parameter },
        new Set()
      ),
      typeDefinition.evaluate(values)
    )
  }
  for (let bits = 0; bits < 8; bits++) {
    const values = Array.from({ length: 3 }, (_, axis) => Boolean(bits & (1 << axis)))
    const [local, known, uncertain] = values
    assert.equal(
      api.referenceNativeValuePlan(
        { text: "X" },
        { localBindings: { has: () => local }, uncertainBinding: uncertain },
        { has: () => known }
      ),
      valueDefinition.evaluate(values)
    )
  }
  for (let bits = 0; bits < 32; bits++) {
    const values = Array.from({ length: 5 }, (_, axis) => Boolean(bits & (1 << axis)))
    const [name, bound, generic, first, one] = values
    const parent = {
      type: generic ? "generic_type" : "other",
      namedChildren: [{ type: "type_identifier" }, { type: "type_arguments", namedChildren: one ? [{}] : [] }]
    }
    const node = { text: name ? "Readonly" : "Other", parent }
    assert.equal(
      api.bindReferenceReadonly(() => first)(node, { has: () => bound }),
      readonlyDefinition.evaluate(values)
    )
  }
  const declaration = readFileSync(join(root, "abi/reference-policy.generated.d.ts"), "utf8")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(join(outputDirectory, "reference-policy.generated.js"), "utf8"), generated)
    assert.equal(readFileSync(join(outputDirectory, "reference-policy.generated.d.ts"), "utf8"), declaration)
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(join(outputDirectory, "reference-policy.generated.js"), generated)
    writeFileSync(join(outputDirectory, "reference-policy.generated.d.ts"), declaration)
  }
  console.log(
    JSON.stringify({
      referenceSpecializations: cases,
      mode: process.argv.includes("--check") ? "checked" : "generated"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
