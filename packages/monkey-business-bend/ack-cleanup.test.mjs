import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const root = resolve(import.meta.dirname, "../..")
const owner = "packages/monkey-business-bend"
function check(path, verdict = false, environment = process.env) {
  const result = spawnSync("bend", [path, verdict ? "--verdict" : "--check-only"], {
    encoding: "utf8",
    timeout: 5000,
    env: environment
  })
  assert.ifError(result.error)
  return { status: result.status, output: result.stdout + result.stderr }
}
function replaceDefinition(source, name, before, after) {
  const start = source.indexOf(`def ${name}(`)
  assert.ok(start >= 0)
  const following = source.indexOf("\ndef ", start + 1)
  const end = following < 0 ? source.length : following
  const body = source.slice(start, end)
  assert.equal(body.split(before).length, 2, `one mutation site in ${name}`)
  return source.slice(0, start) + body.replace(before, after) + source.slice(end)
}

test("ACK cleanup laws pass the mathematical kernel; disabling it fails", () => {
  const proof = join(root, owner, "AckCleanupPROOF.bend")
  const valid = check(proof, true)
  assert.equal(valid.status, 0, valid.output)
  assert.match(valid.output, /ALL PROOFS CHECK/)
  const disabled = check(proof, true, { ...process.env, BENDTT: "/usr/bin/false" })
  assert.equal(disabled.status, 1, disabled.output)
  assert.match(disabled.output, /BendTT infrastructure/)
})

const collectors = owner + "/CollectorScenario.bend"
const collection = "packages/agent-flow-bend/CollectionState.bend"
const mutants = [
  [
    "authorized Finish retired",
    "packages/agent-flow-bend/Canonical.bend",
    "retire_review_when",
    "case False{}: Rejected{state, WrongStage{}}",
    "case False{}: Advanced{state, []}",
    "protected_retirement_is_atomic"
  ],
  [
    "retirement keeps completed work",
    "packages/agent-flow-bend/Canonical.bend",
    "reviewed_released",
    "remove_work(operation, work)",
    "work",
    "successful_retirement_removes_exact_work"
  ],
  [
    "retirement replaces the committed ledger",
    "packages/agent-flow-bend/Canonical.bend",
    "reviewed_released",
    "          updated,",
    "          Ledger.initial(Ledger.Limits{1n,1n,1n,1n}),",
    "successful_retirement_uses_released_capacity"
  ],
  [
    "rejected completion frees payload",
    collectors,
    "completed_record",
    "case True{} True{} Some",
    "case _ True{} Some",
    "rejected_completion_keeps_payload"
  ],
  [
    "uncertain completion frees payload",
    collectors,
    "completed_record",
    "case True{} True{} Some",
    "case True{} _ Some",
    "uncertain_completion_keeps_payload"
  ],
  [
    "ACK forgets finalization",
    collectors,
    "completed_record",
    "[Driver.immediate(C.RetireReview{p, l, r, o}, False{})]",
    "[]",
    "accepted_ack_releases_exact_finding"
  ],
  [
    "ACK retires another operation",
    collectors,
    "completed_record",
    "C.RetireReview{p, l, r, o}",
    "C.RetireReview{p, l, r, 0n}",
    "accepted_ack_releases_exact_finding"
  ],
  [
    "missing payload invented",
    collectors,
    "completed_record",
    "case _ _ _: []",
    "case True{} True{} None{}: [Driver.immediate(C.RetireReview{0n,0n,0n,0n},False{})]\n    case _ _ _: []",
    "missing_payload_is_not_invented"
  ],
  [
    "source mistaken for finding",
    collectors,
    "completed_record",
    "case _ _ _: []",
    "case True{} True{} Some{C.ReviewWorkRecord{p,l,r,o,_,C.AwaitingSourceRead{},_}}: [Driver.immediate(C.RetireReview{p,l,r,o},False{})]\n    case _ _ _: []",
    "source_work_is_not_retired_by_ack"
  ],
  [
    "submission evidence erased",
    collection,
    "released_payload",
    "claims,\n        delivery, revision, reuse, notices}",
    "claims,\n        DeliveryState.initial(), revision, reuse, notices}",
    "payload_release_preserves_submission_evidence"
  ],
  [
    "protected Finish authority erased",
    collection,
    "release_payload_when",
    "case True{}: state",
    "case True{}: released_payload(state, advice)",
    "protected_output_keeps_its_authority"
  ],
  [
    "payload still advertised ready",
    collection,
    "released_payload",
    "remove_ready(advice, ready)",
    "ready",
    "payload_release_exact_state"
  ],
  [
    "failed retirement commits",
    "packages/agent-flow-bend/Canonical.bend",
    "retired_payload",
    "case Rejected{state, reason}: Rejected{state, reason}",
    "case Rejected{state, reason}: Advanced{state, []}",
    "rejected_retirement_is_atomic"
  ]
]
for (const [name, file, definition, before, after, law] of mutants) {
  test(`law rejects compiling mutant: ${name}`, () => {
    const directory = mkdtempSync(join(tmpdir(), "hapsland-ack-cleanup-"))
    try {
      for (const packageName of ["agent-flow-bend", "monkey-business-bend"])
        cpSync(join(root, "packages", packageName), join(directory, "packages", packageName), {
          recursive: true,
          filter: (path) => !path.includes("node_modules") && !path.includes("/dist")
        })
      // Keep the named law and its exact original proof. An unrelated proof
      // becoming non-definitional cannot qualify this mutant's rejection.
      for (const [name, prefix] of [
        ["AckCleanupLAWS.bend", "law "],
        ["AckCleanupPROOF.bend", "def Laws."]
      ]) {
        const source = readFileSync(join(root, owner, name), "utf8")
        const parts = source.split(new RegExp("^" + prefix.replace(".", "\\."), "m"))
        const selected = parts.slice(1).find((part) => part.startsWith(law + (prefix === "law " ? ":" : "(")))
        assert.ok(selected, law)
        writeFileSync(join(directory, owner, name), parts[0] + prefix + selected)
      }
      const control = check(join(directory, owner, "AckCleanupPROOF.bend"))
      assert.equal(control.status, 0, control.output)
      writeFileSync(
        join(directory, file),
        replaceDefinition(readFileSync(join(root, file), "utf8"), definition, before, after)
      )
      const compiled = check(join(directory, file))
      assert.equal(compiled.status, 0, compiled.output)
      const rejected = check(join(directory, owner, "AckCleanupPROOF.bend"))
      assert.equal(rejected.status, 1, rejected.output)
      assert.ok(rejected.output.includes(`Location: Laws.${law}\n`), rejected.output)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
}

test("actual Host witness rejects omitted completion finalization", async () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-ack-wiring-"))
  try {
    for (const source of ["packages/agent-flow-bend", owner, "prototypes/canonical-defense"])
      cpSync(join(root, source), join(directory, source), {
        recursive: true,
        filter: (path) =>
          statSync(path).isDirectory()
            ? !path.includes("node_modules") && !path.includes("/dist")
            : path.endsWith(".bend")
      })
    const run = join(directory, owner, "NativeRun.bend")
    writeFileSync(
      run,
      replaceDefinition(
        readFileSync(run, "utf8"),
        "finalized_payload",
        "CollectorScenario.completed_payload(accepted, event, Engine.canonical(core(state)))",
        "[]"
      )
    )
    const emitted = join(directory, "witness.mjs")
    const build = spawnSync(
      "bend",
      [join(directory, "prototypes/canonical-defense/DefenseJourneyDiagnostics.bend"), "-o", emitted],
      { encoding: "utf8", timeout: 55000 }
    )
    assert.ifError(build.error)
    assert.equal(build.status, 0, build.stdout + build.stderr)
    const { default: G } = await import(pathToFileURL(emitted))
    const list = (value) => {
      const result = []
      while (value.$ === "Con") {
        result.push(value.head)
        value = value.tail
      }
      return result
    }
    let world = G.start(1),
      caught = false
    for (let tick = 0; tick < 1800 && !caught; tick++) {
      const observed = G.observe(world)
      world = observed.world
      for (const frame of list(observed.frames)) {
        if (frame.event?.$ !== "SubmissionTerminal" || !frame.event.certain) continue
        if (!list(frame.outputs).some((output) => output.event?.$ === "SubmissionRecorded")) continue
        caught = list(G.works(world)).some((item) => item.operation === frame.event.advice)
      }
    }
    assert.equal(caught, true, "the real ACK witness must reject omitted finalization even when helper laws pass")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
