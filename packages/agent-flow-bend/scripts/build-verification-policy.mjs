import { extractBendFunctions } from "../../../scripts/pure-bend-artifact.mjs"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { join, resolve } from "node:path"
const root = resolve(import.meta.dirname, "..")
const outputDirectory = resolve(process.argv.slice(2).find((arg) => arg !== "--check") ?? join(root, "dist"))
const expectedVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).hapsland.toolchain.bend.version
assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(), `bend ${expectedVersion}`)
execFileSync("bend", [join(root, "verification-policy/PROOF.bend"), "--verdict"], { timeout: 5000 })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-verification-policy-"))
try {
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [join(root, "verification-policy/core.bend"), "-o", output], { timeout: 5000 })
  const raw = readFileSync(output, "utf8")
  assert.equal(raw.split("export default {").length, 2, "compiler export ABI changed")
  assert.match(raw, /function \$attempt_bucket\$\(/, "compiler native Nat ABI changed")
  const core = (await import(pathToFileURL(output))).default
  const phases = [
    "Loading",
    "Approval",
    "Checking",
    "Recovery",
    "ReplacementApproval",
    "EnteringKey",
    "SavingKey",
    "Done",
    "Cancelled"
  ]
  const actions = [
    "loadFailed",
    "loaded",
    "approve",
    "observed",
    "recheck",
    "replace",
    "back",
    "exit",
    "approveReplacement",
    "entered",
    "inputEnded",
    "stored"
  ]
  const sources = ["MissingSource", "SavedSource", "FileSource", "EnvironmentSource"].map((name) => ({
    $: "Verify" + name
  }))
  const results = ["Accepted", "Rejected", "Forbidden", "RateLimited", "Unconfirmed"].map((name) => ({
    $: "Verify" + name
  }))
  const dimensions = [4, 4, 2, 5, 2, 2]
  const names = ["attempts", "source", "ready", "result", "yes", "stored"]
  const contexts = []
  for (let attempts = 0; attempts < 4; attempts++)
    for (let source = 0; source < 4; source++)
      for (let ready = 0; ready < 2; ready++)
        for (let result = 0; result < 5; result++)
          for (let yes = 0; yes < 2; yes++)
            for (let stored = 0; stored < 2; stored++) contexts.push([attempts, source, ready, result, yes, stored])
  const rowIndex = (values) => values.reduce((index, value, axis) => index * dimensions[axis] + value, 0)
  const routes = [],
    ids = new Map(),
    expectedRoutes = new Map()
  let dispatch = "\nexport const verificationRouteIndex = (phase, action) => { switch (phase) {\n"
  for (const phase of phases) {
    dispatch += `case ${JSON.stringify(phase)}: switch (action) {\n`
    const groups = new Map()
    for (const action of actions) {
      const phaseTag = { $: "Verify" + phase },
        actionTag = { $: "Verify" + action[0].toUpperCase() + action.slice(1) }
      const full = contexts.map(([attempts, source, ready, result, yes, stored]) =>
        core.step(
          phaseTag,
          actionTag,
          true,
          BigInt(attempts),
          sources[source],
          Boolean(ready),
          results[result],
          Boolean(yes),
          Boolean(stored)
        )
      )
      const fingerprints = full.map((plan) => JSON.stringify(plan))
      const axes = names.flatMap((name, axis) => {
        const changes = contexts.some((values, index) => {
          const base = [...values]
          base[axis] = 0
          return fingerprints[index] !== fingerprints[rowIndex(base)]
        })
        return changes ? [{ name, radix: dimensions[axis], axis }] : []
      })
      const plans = []
      for (let index = 0; index < contexts.length; index++) {
        const key = axes.reduce((key, { axis, radix }) => key * radix + contexts[index][axis], 0)
        if (plans[key] === undefined) plans[key] = full[index]
        else assert.deepEqual(plans[key], full[index])
      }
      const route = { axes: axes.map(({ name, radix }) => ({ name, radix })), plans }
      const fingerprint = JSON.stringify(route)
      if (!ids.has(fingerprint)) {
        ids.set(fingerprint, routes.length)
        routes.push(route)
      }
      const id = ids.get(fingerprint)
      expectedRoutes.set(phase + ":" + action, id)
      groups.set(id, [...(groups.get(id) ?? []), action])
      // Check the entire domain and representative saturated counts against the original compiled core.
      for (const count of [0, 1, 2, 3, 4, 31, 65536])
        for (const values of contexts) {
          const [_, source, ready, result, yes, stored] = values
          const bucket = Number(core.attempt_bucket(BigInt(count)))
          const facts = [bucket, source, ready, result, yes, stored]
          const index = axes.reduce((key, { axis, radix }) => key * radix + facts[axis], 0)
          assert.deepEqual(
            plans[index],
            core.step(
              phaseTag,
              actionTag,
              true,
              BigInt(count),
              sources[source],
              Boolean(ready),
              results[result],
              Boolean(yes),
              Boolean(stored)
            )
          )
        }
    }
    for (const [id, actions] of groups)
      dispatch += actions.map((action) => `case ${JSON.stringify(action)}:`).join(" ") + ` return ${id};\n`
    dispatch += 'default: throw new TypeError("Unknown verification action"); }\n'
  }
  dispatch += 'default: throw new TypeError("Unknown verification phase"); }};\n'
  dispatch += `export const verificationRoutes = ${JSON.stringify(routes)};\n`
  const commandNames = {
    VerifyLoadCommand: "load",
    VerifyCheckCommand: "check",
    VerifyInputCommand: "input",
    VerifySaveCommand: "save",
    VerifyNoCommand: undefined
  }
  dispatch += "export const verificationCommandName = phase => { switch (phase) {\n"
  for (const phase of phases) {
    const command = core.command({ $: "Verify" + phase })
    assert.ok(Object.hasOwn(commandNames, command.$))
    dispatch += `case ${JSON.stringify(phase)}: return ${JSON.stringify(commandNames[command.$]) ?? "undefined"};\n`
  }
  dispatch += 'default: throw new TypeError("Unknown verification phase"); }};\n'
  const generated =
    extractBendFunctions(raw, ["$attempt_bucket$", "$max_checks$"]) +
    "\nexport const verificationMaxChecks = $max_checks$;\nexport const verificationAttemptBucket = $attempt_bucket$;\n" +
    dispatch
  const specializedOutput = join(temporary, "specialized.mjs")
  writeFileSync(specializedOutput, generated)
  const specialized = await import(pathToFileURL(specializedOutput))
  for (const phase of phases) {
    assert.equal(specialized.verificationCommandName(phase), commandNames[core.command({ $: "Verify" + phase }).$])
    for (const action of actions)
      assert.equal(specialized.verificationRouteIndex(phase, action), expectedRoutes.get(phase + ":" + action))
  }
  for (const count of [0, 1, 2, 3, 4, 31, 65536, Number.MAX_SAFE_INTEGER])
    assert.equal(specialized.verificationAttemptBucket(count), Number(core.attempt_bucket(BigInt(count))))
  const target = join(outputDirectory, "verification-policy.generated.js"),
    declaration = join(outputDirectory, "verification-policy.generated.d.ts"),
    abi = join(root, "abi/verification-policy.generated.d.ts")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(target, "utf8"), generated)
    assert.ok(readFileSync(declaration).equals(readFileSync(abi)))
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(target, generated)
    copyFileSync(abi, declaration)
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
