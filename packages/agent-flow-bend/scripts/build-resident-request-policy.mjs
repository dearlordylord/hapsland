import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
const root = resolve(import.meta.dirname, "..")
const outputDirectory = resolve(process.argv.slice(2).find((arg) => arg !== "--check") ?? join(root, "dist"))
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).hapsland.toolchain.bend.version
assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(), `bend ${version}`)
execFileSync("bend", [join(root, "resident-request-policy/PROOF.bend"), "--verdict"], { timeout: 5000 })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-resident-request-"))
try {
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [join(root, "resident-request-policy/core.bend"), "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const operations = {
    hello: "Hello",
    "register-edit": "RegisterEdit",
    admit: "Admit",
    "admit-and-collect": "AdmitAndCollect",
    "begin-stop": "BeginStop",
    __other__: "Other"
  }
  const planNames = {
    RequestContinue: "continue",
    RequestReady: "ready",
    RequestObsolete: "obsolete",
    RequestEditLost: "editLost"
  }
  const definitions = [
    { name: "residentRequestNeedsSweep", parameters: "operation", axes: [], leaf: (op) => core.needs_sweep(op) },
    {
      name: "residentRequestUnsupported",
      parameters: "operation,direct,observed",
      axes: ["direct", "observed"],
      leaf: (op, [direct, observed]) => core.unsupported(op, direct, observed)
    },
    {
      name: "residentRequestNeedsSnapshot",
      parameters: "operation,matched",
      axes: ["matched"],
      leaf: (op, [matched]) => core.needs_snapshot(op, matched)
    },
    {
      name: "bindResidentRequestLifetime",
      bind: true,
      parameters: "operation,matched,active,edit",
      axes: ["matched", "active", "edit"],
      leaf: (op, [matched, active, edit]) => {
        const tag = core.lifetime(op, matched, active, edit).$
        assert.ok(Object.hasOwn(planNames, tag))
        return planNames[tag]
      }
    }
  ]
  const choose = (test, yes, no) => (yes === no ? yes : `(${test}?${yes}:${no})`)
  const expression = (axes, leaf, index = 0, values = []) =>
    index === axes.length
      ? JSON.stringify(leaf(values))
      : choose(
          axes[index],
          expression(axes, leaf, index + 1, [...values, true]),
          expression(axes, leaf, index + 1, [...values, false])
        )
  let generated = ""
  for (const definition of definitions) {
    const groups = new Map()
    for (const [operation, tag] of Object.entries(operations)) {
      const value = expression(definition.axes, (values) => definition.leaf({ $: tag }, values))
      const keys = groups.get(value) ?? []
      keys.push(operation)
      groups.set(value, keys)
    }
    const fallback = [...groups].find(([, keys]) => keys.includes("__other__"))[0]
    let body = fallback
    for (const [value, keys] of [...groups].reverse())
      if (value !== fallback)
        body = choose(keys.map((key) => `operation===${JSON.stringify(key)}`).join("||"), value, body)
    if (definition.bind) {
      for (const name of Object.values(planNames))
        body = body.replaceAll(JSON.stringify(name), `${name === "continue" ? "continuing" : name}()`)
    }
    generated += `export const ${definition.name}=${definition.bind ? "({continue:continuing,ready,obsolete,editLost})=>" : ""}(${definition.parameters})=>${body};\n`
  }
  const specialized = join(temporary, "specialized.mjs")
  writeFileSync(specialized, generated)
  const api = await import(pathToFileURL(specialized))
  let cases = 0
  for (const definition of definitions)
    for (const [operation, tag] of Object.entries(operations))
      for (let index = 0; index < 2 ** definition.axes.length; index++) {
        const values = definition.axes.map((_, axis) => Boolean(index & (1 << axis)))
        const calls = []
        const fn = definition.bind
          ? api[definition.name](
              Object.fromEntries(
                Object.values(planNames).map((name) => [
                  name,
                  () => {
                    calls.push(name)
                    return name
                  }
                ])
              )
            )
          : api[definition.name]
        const expected = definition.leaf({ $: tag }, values)
        assert.equal(fn(operation, ...values), expected)
        if (definition.bind) assert.deepEqual(calls, [expected])
        cases++
      }
  const declaration = readFileSync(join(root, "abi/resident-request-policy.generated.d.ts"), "utf8")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(join(outputDirectory, "resident-request-policy.generated.js"), "utf8"), generated)
    assert.equal(readFileSync(join(outputDirectory, "resident-request-policy.generated.d.ts"), "utf8"), declaration)
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(join(outputDirectory, "resident-request-policy.generated.js"), generated)
    writeFileSync(join(outputDirectory, "resident-request-policy.generated.d.ts"), declaration)
  }
  console.log(
    JSON.stringify({
      residentRequestSpecializations: cases,
      mode: process.argv.includes("--check") ? "checked" : "generated"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
