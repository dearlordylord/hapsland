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
const temporary = mkdtempSync(join(tmpdir(), "hapsland-binding-artifact-"))
try {
  const verdict = execFileSync("bend", [root + "/binding-policy/PROOF.bend", "--verdict"], {
    encoding: "utf8",
    timeout: 5000
  })
  assert.ok(verdict.includes("ALL PROOFS CHECK"))
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [root + "/binding-policy/core.bend", "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const definitions = [
    {
      name: "bindingUnsupportedAssignment",
      axes: ["identifier", "bound", "pattern"],
      evaluate: (values) => core.unsupported_assignment(...values)
    },
    {
      name: "bindingActions",
      axes: ["uncertain", "mutation", "unsupported", "binding", "identifier"],
      evaluate: (values) => core.binding_actions(...values).$
    },
    { name: "bindingInitialArguments", axes: ["lexical"], evaluate: (values) => core.initial_arguments(...values) },
    {
      name: "bindingUncertain",
      axes: ["uncertain"],
      evaluate: (values) => core.binding_actions(values[0], false, false, false, false).$ === "Mark"
    },
    {
      name: "bindingMutation",
      axes: ["mutation", "unsupported"],
      evaluate: (values) => core.binding_actions(false, ...values, false, false).$ === "Mark"
    },
    {
      name: "bindingNeedsName",
      axes: ["binding"],
      evaluate: (values) => core.binding_actions(false, false, false, values[0], true).$ === "Bind"
    },
    {
      name: "bindingIdentifier",
      axes: ["identifier"],
      evaluate: (values) => core.binding_actions(false, false, false, true, values[0]).$ === "Bind"
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
  const predicate = (name) => expression(definitions.find((definition) => definition.name === name))
  const nativeAssignment = expression({
    axes: [
      'target?.type === "identifier"',
      "boundFunctions.has(target.text)",
      'uncertainAssignmentSyntax.has(target?.type ?? "")'
    ],
    evaluate: (values) => core.unsupported_assignment(...values)
  })
  const nativeUncertain = predicate("bindingUncertain").replace(
    /\buncertain\b/g,
    "uncertainScopeSyntax.has(child.type)"
  )
  const nativeMutation = predicate("bindingMutation")
    .replace(/\bmutation\b/g, "mutationSyntax.has(child.type)")
    .replace(/\bunsupported\b/g, "unsupportedAssignmentTarget(child.namedChildren[0],boundFunctions)")
  const nativeBinding = predicate("bindingNeedsName").replace(/\bbinding\b/g, "bindingSyntax.has(child.type)")
  const nativeIdentifier = predicate("bindingIdentifier").replace(/\bidentifier\b/g, 'binding?.type === "identifier"')
  const generated =
    definitions
      .map(
        (definition) => `export const ${definition.name}=(${definition.axes.join(",")})=>${expression(definition)};\n`
      )
      .join("") +
    `export const bindUnsupportedAssignment=(uncertainAssignmentSyntax)=>(target,boundFunctions)=>${nativeAssignment};\n` +
    `export const bindFunctionBinding=(uncertainScopeSyntax,mutationSyntax,bindingSyntax,unsupportedAssignmentTarget,markUncertainBinding)=>(child,scope,boundFunctions)=>{if(${nativeUncertain}){markUncertainBinding(child,scope);return}if(${nativeMutation})markUncertainBinding(child,scope);if(!(${nativeBinding}))return;const binding=child.namedChildren[0];if(${nativeIdentifier}){scope.localBindings.add(binding.text);return}markUncertainBinding(child,scope)};\n`
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
  const declaration = readFileSync(join(root, "abi/binding-policy.generated.d.ts"), "utf8")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(join(outputDirectory, "binding-policy.generated.js"), "utf8"), generated)
    assert.equal(readFileSync(join(outputDirectory, "binding-policy.generated.d.ts"), "utf8"), declaration)
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(join(outputDirectory, "binding-policy.generated.js"), generated)
    writeFileSync(join(outputDirectory, "binding-policy.generated.d.ts"), declaration)
  }
  console.log(
    JSON.stringify({ bindingSpecializations: cases, mode: process.argv.includes("--check") ? "checked" : "generated" })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
