import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { captureNativeFixtureIdentity, assertNativeFixtureIdentity } from "./native-preflight.mjs"
export { runWorkloadNative as runFreshnessNative } from "./workload-native-runner.mjs"

// Emission uses the shared fifteen-second JS allowance; execution remains five.
// This is compiler output adaptation
// for test-only literal data, never event scheduling or a freshness decision.
export function runFreshnessEmitted(fixture) {
  const identity = captureNativeFixtureIdentity(fixture)
  const directory = mkdtempSync(join(tmpdir(), "hapsland-freshness-js-"))
  try {
    const output = join(directory, "fixture.mjs")
    checked(identity.inputs.tools.bend.path, [fileURLToPath(fixture), "-o", output], 15000)
    assertNativeFixtureIdentity(identity, fixture)
    const source = readFileSync(output, "utf8")
    const offset = source.lastIndexOf("export default {")
    if (offset < 0 || !source.includes("function $trace$(")) throw new Error("Bend fixture JavaScript layout changed")
    writeFileSync(
      output,
      source.slice(0, offset) + `${rows.toString()}\nconsole.log(JSON.stringify(rows(run_loop($trace$()))));\n`
    )
    const result = JSON.parse(checked(process.execPath, [output], 5000))
    assertNativeFixtureIdentity(identity, fixture)
    return result
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
function checked(command, args, timeout) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout,
    env: { ...process.env, BEND_NO_TELEMETRY: "1" }
  })
  if (result.error || result.status !== 0) throw result.error ?? new Error(result.stdout + result.stderr)
  return result.stdout
}
function rows(value) {
  if (typeof value === "bigint") {
    if (value < 0n || value >= 2n ** 48n) throw new TypeError("invalid fixture Nat")
    return Number(value)
  }
  if (value && typeof value === "object" && (value.$ === "Con" || value.$ === "Nil")) {
    const result = []
    let cursor = value
    for (let count = 0; count < 2048 && cursor.$ === "Con"; count++, cursor = cursor.tail)
      result.push(rows(cursor.head))
    if (cursor.$ !== "Nil") throw new TypeError("invalid bounded fixture list")
    return result
  }
  return value
}
