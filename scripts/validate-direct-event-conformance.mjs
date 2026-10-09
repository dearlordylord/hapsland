import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(new URL("../", import.meta.url).pathname)
const manifestPath = resolve(root, "conformance/direct-event-v1.json")
const manifest = JSON.parse(await readFile(manifestPath, "utf8"))

const fail = (message) => {
  process.stderr.write(`direct-event conformance invalid: ${message}\n`)
  process.exitCode = 1
}

if (manifest.schemaVersion !== 1 || manifest.ordinaryTests !== "deterministic-offline") {
  fail("manifest identity or offline policy is missing")
}
if (!Array.isArray(manifest.groups) || manifest.groups.length !== 12) {
  fail("exactly twelve acceptance groups are required")
}
const numbers = manifest.groups?.map((group) => group.group) ?? []
if (numbers.join(",") !== "1,2,3,4,5,6,7,8,9,10,11,12") {
  fail("acceptance groups must be complete and ordered")
}

const references = new Set()
let obligationCount = 0
let checkCount = 0
for (const group of manifest.groups ?? []) {
  if (
    typeof group.boundary !== "string" ||
    group.boundary.length === 0 ||
    !Array.isArray(group.obligations) ||
    group.obligations.length === 0
  ) {
    fail(`group ${group.group} has no boundary or obligations`)
    continue
  }
  for (const obligation of group.obligations) {
    obligationCount += 1
    if (
      typeof obligation.id !== "string" ||
      typeof obligation.policy !== "string" ||
      obligation.policy.length === 0 ||
      !Array.isArray(obligation.checks) ||
      obligation.checks.length === 0
    ) {
      fail(`group ${group.group} has a malformed obligation`)
      continue
    }
    for (const check of obligation.checks) {
      checkCount += 1
      if (!Array.isArray(check) || check.length !== 2) {
        fail(`obligation ${obligation.id} has a malformed check`)
        continue
      }
      const [file, title] = check
      const reference = `${file}\0${title}`
      if (references.has(reference)) fail(`duplicate check reference: ${file}: ${title}`)
      references.add(reference)
      const content = await readFile(resolve(root, file), "utf8").catch(() => undefined)
      if (content === undefined) fail(`obligation ${obligation.id} references missing ${file}`)
      else if (!content.includes(`"${title}"`)) fail(`obligation ${obligation.id} references missing check: ${title}`)
    }
  }
}

if (process.exitCode === undefined) {
  process.stdout.write(
    `direct-event conformance manifest valid: 12 groups, ${obligationCount} obligations, ${checkCount} unique mapped checks\n`
  )
}
