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
const temporary = mkdtempSync(join(tmpdir(), "hapsland-callable-artifact-"))
try {
  execFileSync("bend", [root + "/callable-policy/PROOF.bend", "--verdict"], { timeout: 5000 })
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [root + "/callable-policy/core.bend", "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const definitions = [
    {
      name: "callableRuntimeImport",
      fn: "runtime_import",
      kinds: { namedEffect: "NamedEffect", effectNamespace: "EffectNamespace", other: "OtherImport" },
      axes: ["typeOnly"],
      kindParameters: ["binding"],
      kindTests: {
        namedEffect: 'binding.path==="effect"&&binding.name==="Effect"',
        effectNamespace: 'binding.path==="effect/Effect"&&binding.name==="*"'
      },
      kindInputs: {
        namedEffect: { path: "effect", name: "Effect" },
        effectNamespace: { path: "effect/Effect", name: "*" },
        other: { path: "other", name: "other" }
      }
    },
    {
      name: "callableWrapper",
      fn: "wrapper",
      kinds: { fn: "Fn", fnUntraced: "FnUntraced", other: "OtherMethod" },
      axes: ["types", "member", "binding", "invoked", "label"],
      arguments: (kind, values) => [...values.slice(0, 3), kind, ...values.slice(3)]
    },
    {
      name: "callableInlineBody",
      fn: "inline_body",
      kinds: {
        arrow_function: "Arrow",
        function_expression: "FunctionExpression",
        generator_function: "GeneratorFunction",
        other: "OtherBody"
      },
      axes: []
    },
    {
      name: "callableValuePlan",
      fn: "callable_value",
      kinds: { arrow_function: "DirectArrow", call_expression: "WrapperCall", other: "OtherValue" },
      axes: ["types", "wrapper", "one", "body"],
      plan: true
    },
    { name: "callableConstDeclaration", fn: "const_callable", axes: ["lexical", "one", "identifier", "callable"] }
  ]
  definitions.push(
    {
      name: "callableWrapperFinish",
      kinds: { fn: "Fn", fnUntraced: "FnUntraced", other: "OtherMethod" },
      axes: ["invoked", "label"],
      evaluate: (kind, values) => core.wrapper(false, true, true, kind, ...values)
    },
    {
      name: "callableValueBodyAccepted",
      kinds: {
        arrow_function: "Arrow",
        function_expression: "FunctionExpression",
        generator_function: "GeneratorFunction",
        other: "OtherBody"
      },
      axes: [],
      evaluate: (kind) =>
        core.callable_value({ $: "WrapperCall" }, false, true, true, core.inline_body(kind)).$ === "InlineArgument"
    },
    {
      name: "callableMethodEligible",
      kinds: { fn: "Fn", fnUntraced: "FnUntraced", other: "OtherMethod" },
      axes: [],
      evaluate: (kind) => core.wrapper(false, true, true, kind, false, false)
    },
    {
      name: "callableWrapperNeedsLabel",
      kinds: { fn: "Fn", fnUntraced: "FnUntraced", other: "OtherMethod" },
      axes: [],
      evaluate: (kind) => core.wrapper(false, true, true, kind, true, true)
    },
    {
      name: "callableImportNeedsMetadata",
      axes: ["typeOnly"],
      evaluate: (_, values) =>
        ["NamedEffect", "EffectNamespace", "OtherImport"].some((tag) => core.runtime_import({ $: tag }, ...values))
    },
    {
      name: "callableCalleeNeedsMember",
      axes: ["types"],
      evaluate: (_, values) => core.wrapper(values[0], true, true, { $: "Fn" }, false, false)
    },
    {
      name: "callableValueRoute",
      kinds: { arrow_function: "DirectArrow", call_expression: "WrapperCall", other: "OtherValue" },
      axes: [],
      evaluate: (kind) =>
        ({ Self: "self", InlineArgument: "call", Reject: "reject" })[
          core.callable_value(kind, false, true, true, true).$
        ]
    },
    {
      name: "callableValueNeedsCallee",
      axes: ["types"],
      evaluate: (_, values) =>
        core.callable_value({ $: "WrapperCall" }, values[0], true, true, true).$ === "InlineArgument"
    },
    {
      name: "callableValueNeedsArity",
      axes: ["wrapper"],
      evaluate: (_, values) =>
        core.callable_value({ $: "WrapperCall" }, false, values[0], true, true).$ === "InlineArgument"
    },
    {
      name: "callableValueNeedsBody",
      axes: ["one"],
      evaluate: (_, values) =>
        core.callable_value({ $: "WrapperCall" }, false, true, values[0], true).$ === "InlineArgument"
    },
    {
      name: "callableConstNeedsDeclarators",
      axes: ["lexical"],
      evaluate: (_, values) => core.const_callable(values[0], true, true, true)
    },
    {
      name: "callableConstNeedsFields",
      axes: ["one"],
      evaluate: (_, values) => core.const_callable(true, values[0], true, true)
    }
  )
  const plans = { Self: "self", InlineArgument: "argument", Reject: "reject" }
  const leaf = (definition, kind, values) => {
    const args = definition.arguments
      ? definition.arguments(kind, values)
      : definition.kinds
        ? [kind, ...values]
        : values
    if (definition.evaluate) return definition.evaluate(kind, values)
    const result = core[definition.fn](...args)
    return definition.plan ? plans[result.$] : result
  }
  const choose = (test, yes, no) => (yes === no ? yes : `(${test}?${yes}:${no})`)
  const expression = (definition, kind, index = 0, values = []) =>
    index === definition.axes.length
      ? JSON.stringify(leaf(definition, kind, values))
      : choose(
          definition.axes[index],
          expression(definition, kind, index + 1, [...values, true]),
          expression(definition, kind, index + 1, [...values, false])
        )
  let generated = ""
  for (const definition of definitions) {
    let body
    if (definition.kinds) {
      body = expression(definition, { $: definition.kinds.other })
      for (const [name, tag] of Object.entries(definition.kinds).reverse())
        if (name !== "other")
          body = choose(
            definition.kindTests?.[name] ?? `kind===${JSON.stringify(name)}`,
            expression(definition, { $: tag }),
            body
          )
    } else body = expression(definition)
    generated += `export const ${definition.name}=(${[...(definition.kinds ? (definition.kindParameters ?? ["kind"]) : []), ...definition.axes].join(",")})=>${body};\n`
  }
  const artifact = join(temporary, "specialized.mjs")
  writeFileSync(artifact, generated)
  const api = await import(pathToFileURL(artifact))
  let cases = 0
  for (const definition of definitions)
    for (const [name, tag] of Object.entries(definition.kinds ?? { none: null }))
      for (let bits = 0; bits < 2 ** definition.axes.length; bits++) {
        const values = definition.axes.map((_, axis) => Boolean(bits & (1 << axis)))
        assert.equal(
          api[definition.name](...(definition.kinds ? [definition.kindInputs?.[name] ?? name, ...values] : values)),
          leaf(definition, { $: tag }, values)
        )
        cases++
      }
  const declaration = readFileSync(join(root, "abi/callable-policy.generated.d.ts"), "utf8")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(join(outputDirectory, "callable-policy.generated.js"), "utf8"), generated)
    assert.equal(readFileSync(join(outputDirectory, "callable-policy.generated.d.ts"), "utf8"), declaration)
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(join(outputDirectory, "callable-policy.generated.js"), generated)
    writeFileSync(join(outputDirectory, "callable-policy.generated.d.ts"), declaration)
  }
  console.log(
    JSON.stringify({ callableSpecializations: cases, mode: process.argv.includes("--check") ? "checked" : "generated" })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
