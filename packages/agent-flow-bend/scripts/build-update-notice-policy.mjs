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
execFileSync("bend", [join(root, "update-notice-policy/PROOF.bend"), "--verdict"], { timeout: 5000 })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-update-notice-"))
try {
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [join(root, "update-notice-policy/core.bend"), "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const operations = {
    hello: "Hello",
    admit: "Admit",
    "admit-and-collect": "AdmitAndCollect",
    "edit-policy": "EditPolicy",
    "prompt-marker": "PromptMarker",
    "register-edit": "RegisterEdit",
    collect: "Collect",
    __other__: "Other"
  }
  const choose = (test, yes, no) => (yes === no ? yes : `(${test}?${yes}:${no})`)
  const expression = (axes, leaf, index = 0, values = []) =>
    index === axes.length
      ? String(leaf(values))
      : choose(
          axes[index],
          expression(axes, leaf, index + 1, [...values, true]),
          expression(axes, leaf, index + 1, [...values, false])
        )
  const dispatch = (name, parameters, axes, leaf) => {
    let source = `export const ${name}=(${parameters})=>{switch(operation){\n`
    for (const [operation, tag] of Object.entries(operations))
      source += `${tag === "Other" ? "default" : `case ${JSON.stringify(operation)}`}:return ${expression(axes, (values) => leaf({ $: tag }, values))};\n`
    return source + "}};\n"
  }
  let generated = dispatch(
    "updateNoticeIncompatible",
    "operation,present,current",
    ["present", "current"],
    (op, [present, current]) => core.incompatible(op, present, current)
  )
  generated += dispatch(
    "updateNoticeOpportunity",
    "override,operation,recipientPi,ordinary",
    ["override!==undefined", "override===true", "recipientPi", "ordinary"],
    (op, [explicit, value, pi, ordinary]) =>
      core.opportunity(explicit ? { $: "Explicit", value } : { $: "Automatic" }, op, pi, ordinary)
  )
  generated += `export const updateNoticeGrant=(already,full)=>${expression(["already", "full"], ([already, full]) => core.grant(already, full))};\n`
  const specialized = join(temporary, "specialized.mjs")
  writeFileSync(specialized, generated)
  const api = await import(pathToFileURL(specialized))
  let cases = 0
  for (const [operation, tag] of Object.entries(operations)) {
    for (const present of [false, true])
      for (const current of [false, true]) {
        assert.equal(
          api.updateNoticeIncompatible(operation, present, current),
          core.incompatible({ $: tag }, present, current)
        )
        cases++
      }
    for (const override of [undefined, false, true])
      for (const pi of [false, true])
        for (const ordinary of [false, true]) {
          assert.equal(
            api.updateNoticeOpportunity(override, operation, pi, ordinary),
            core.opportunity(
              override === undefined ? { $: "Automatic" } : { $: "Explicit", value: override },
              { $: tag },
              pi,
              ordinary
            )
          )
          cases++
        }
  }
  for (const already of [false, true])
    for (const full of [false, true]) {
      assert.equal(api.updateNoticeGrant(already, full), core.grant(already, full))
      cases++
    }
  const declaration = readFileSync(join(root, "abi/update-notice-policy.generated.d.ts"), "utf8")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(join(outputDirectory, "update-notice-policy.generated.js"), "utf8"), generated)
    assert.equal(readFileSync(join(outputDirectory, "update-notice-policy.generated.d.ts"), "utf8"), declaration)
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(join(outputDirectory, "update-notice-policy.generated.js"), generated)
    writeFileSync(join(outputDirectory, "update-notice-policy.generated.d.ts"), declaration)
  }
  console.log(
    JSON.stringify({
      updateNoticeSpecializations: cases,
      mode: process.argv.includes("--check") ? "checked" : "generated"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
