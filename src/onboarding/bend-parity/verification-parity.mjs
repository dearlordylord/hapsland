import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { reduceVerification, verificationCommand, MAX_KEY_CHECKS } from "./verification-reference.ts"
import { phases, actions, sources, sourceTags, results, resultTags, fixture } from "./verification-fixtures.mjs"
const commandNames = {
  VerifyLoadCommand: "load",
  VerifyCheckCommand: "check",
  VerifyInputCommand: "input",
  VerifySaveCommand: "save"
}
const directory = mkdtempSync(join(tmpdir(), "hapsland-verification-"))
try {
  const source = process.argv[2] ?? "packages/agent-flow-bend/verification-policy/core.bend"
  const output = join(directory, "core.mjs")
  execFileSync("bend", [source, "-o", output], { timeout: 5000, stdio: "pipe" })
  const { default: core } = await import(pathToFileURL(output))
  assert.equal(Number(core.max_checks()), MAX_KEY_CHECKS)
  for (const attempts of [0, 1, 2, 3, 4, 31, 65536])
    assert.equal(Number(core.attempt_bucket(BigInt(attempts))), Math.min(attempts, MAX_KEY_CHECKS))
  let cases = 0
  for (const phase of phases) {
    const model = fixture(phase, 0, "saved", "accepted", 1).model
    const command = core.command({ $: "Verify" + phase })
    assert.deepEqual(
      command.$ === "VerifyNoCommand"
        ? undefined
        : { kind: commandNames[command.$], id: 7, ...(command.$ === "VerifyCheckCommand" ? { keyRevision: 11 } : {}) },
      verificationCommand(model)
    )
    for (const attempts of [0, 1, 2, 3, 4, 31, 65536])
      for (let sourceId = 0; sourceId < sources.length; sourceId++)
        for (let resultId = 0; resultId < results.length; resultId++)
          for (let bits = 0; bits < 16; bits++) {
            const f = fixture(phase, attempts, sources[sourceId], results[resultId], bits)
            for (const actionKind of actions) {
              const action = f.actions[actionKind]
              const expected = reduceVerification(f.model, { revision: f.current ? 7 : 6, action })
              const plan = core.step(
                { $: "Verify" + phase },
                { $: "Verify" + actionKind[0].toUpperCase() + actionKind.slice(1) },
                f.current,
                BigInt(attempts),
                { $: "Verify" + sourceTags[sourceId] },
                f.ready,
                { $: "Verify" + resultTags[resultId] },
                f.yes,
                f.stored
              )
              let actual = f.model
              if (plan.$ !== "VerifyHold") {
                assert.equal(plan.$, "VerifyAdvance")
                const patches = {
                  VerifyNoPatch: {},
                  VerifyUnavailablePatch: { eligibility: "unavailable" },
                  VerifyLoadedPatch: { source: action.source, eligibility: action.eligibility, keyRevision: 12 },
                  VerifyAttemptPatch: { attempts: attempts + 1 },
                  VerifyObservationPatch: {
                    observations: [
                      ...f.model.observations,
                      { attempt: attempts, source: f.model.source, result: action.result }
                    ]
                  },
                  VerifyStoragePatch: { storage: action.storage }
                }
                assert.ok(Object.hasOwn(patches, plan.patch.$))
                actual = { ...f.model, ...patches[plan.patch.$], phase: plan.phase.$.slice(6), revision: 8 }
              }
              assert.deepEqual(
                actual,
                expected,
                `phase=${phase} action=${actionKind} attempts=${attempts} source=${sourceId} result=${resultId} bits=${bits}`
              )
              if (expected === f.model) assert.equal(actual, f.model)
              cases++
            }
          }
  }
  const record = {
    at: new Date().toISOString(),
    cases,
    commands: phases.length,
    result: "pass",
    scope:
      "complete enum/Boolean domain at attempt counts 0,1,2,3,4,31,65536; original native reducer comparison; separately kernel-checked laws cover unbounded Nat decisions, not host execution"
  }
  if (!process.argv[2])
    writeFileSync("evidence/bend-strangler/verification-parity.json", JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify(record))
} finally {
  rmSync(directory, { recursive: true, force: true })
}
