import Shared from "./session.mjs"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
const temp = mkdtempSync(join(tmpdir(), "hapsland-session-native-"))
const run = (program, args, timeout) => {
  const result = spawnSync(program, args, { encoding: "utf8", timeout })
  if (result.error || result.status !== 0) throw result.error ?? new Error(result.stdout + result.stderr)
  return result.stdout.trim()
}
const list = (values) => values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
try {
  const binary = join(temp, "trace")
  run("bend", [fileURLToPath(new URL("SessionTrace.bend", import.meta.url)), "-o", binary], 5000)
  const config = {
    $: "Session.Settings",
    interval: 31,
    variation: 23,
    edits: 2,
    pause: 71,
    response: 3,
    repairDelay: 113
  }
  const initial = Shared.initial(config, 4294967295, list([97, 103, 101, 110, 116, 45, 49]), 123n, list([1n, 2n, 333n]))
  const task = Shared.next(config, initial),
    edit = Shared.next(config, Shared.transition_state(task))
  const after = Shared.transition_state(edit)
  const expected = [after.task, after.revision, after.random, Shared.sample_delay(config, after.random)].join(":")
  const actual = run(binary, ["--threads", "4"], 5000)
  if (actual !== expected) throw new Error(`Native/JS mismatch: ${actual} != ${expected}`)
  console.log(`Native/JS shared-source parity: ${actual}`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
