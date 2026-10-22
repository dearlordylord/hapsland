import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const project = join(root, "journey-proof")
const source = readFileSync(join(project, "LAWS.bend"), "utf8")
const imports = source.slice(0, source.indexOf("\n\n") + 2)
const laws = new Map(
  [...source.matchAll(/^law (\w+):\n([\s\S]*?)(?=^law |$(?![\s\S]))/gm)].map(([, name, raw]) => {
    const body = raw.replace(/^#.*\n/gm, "").trimEnd()
    const binders = [...body.matchAll(/^  for \+?(\w+):/gm)].map((m) => m[1])
    const claim = body.slice(body.lastIndexOf("\n  {") + 1).trim()
    const premises = [...body.matchAll(/^  for (\w+): ([\s\S]*?)(?=^  for |^  \{|$(?![\s\S]))/gm)]
      .map(([, name, type]) => ({ name, type: type.trim() }))
      .filter(({ type }) => type.startsWith("{") || type.startsWith("Core."))
    return [name, { body, binders, claim, premises }]
  })
)
const nat = (n) => `${n}n`
const bool = (b) => (b ? "True{}" : "False{}")
const list = (xs) => (xs.length ? `${xs.join(" <> ")} <> Nil{}` : "Nil{}")
const witness = (n) => (n ? `({==}, ${witness(n - 1)})` : "Unit{}")
const transientWitness = (n, retained) =>
  n ? `(${witness(n - 1 + retained)}, ${transientWitness(n - 1, retained)})` : "Unit{}"
const rows = []
const add = (name, at) => {
  const law = laws.get(name)
  assert.ok(law, name)
  assert.deepEqual(Object.keys(at).sort(), [...law.binders].sort(), `${name}: exact binders`)
  const pattern = new RegExp(`\\b(${law.binders.join("|")})\\b`, "g")
  const instantiate = (text) => text.replace(pattern, (name) => at[name])
  rows.push({
    name,
    at,
    claim: instantiate(law.claim),
    premises: law.premises.map(({ name, type }) => ({ type: instantiate(type), witness: at[name] }))
  })
}
const work = (id, kind, parent = 9, partition = 1) =>
  `Canonical.ReviewWorkRecord{${nat(partition)}, 1n, 2n, ${nat(id)}, ${nat(id)}, Canonical.${kind}, ${nat(parent)}}`
const kinds = [
  "AwaitingSourceRead{}",
  "SourceReading{}",
  "Preparing{}",
  "Reviewing{}",
  "ReviewServiceRequestOutstanding{}",
  "PendingFinding{2n}"
]
for (const seed of [0, 1, 7])
  for (const count of [0, 1, 3, 7]) {
    const items = list(
      Array.from({ length: count }, (_, i) =>
        work(i + 1, kinds[(i + seed) % kinds.length], i % 2 ? 9 : 8, i % 2 ? 1 : 3)
      )
    )
    for (const partition of [1, 3]) {
      add("cutoff_preserves_every_finding", { items, partition: nat(partition), lifetime: "1n", round: "2n" })
      add("findings_do_not_block_collection", {
        items,
        partition: nat(partition),
        lifetime: "1n",
        round: "2n",
        observation: "9n"
      })
    }
    for (let operation = 0; operation <= count + 1; operation++) {
      add("removal_preserves_other_findings", { items, operation: nat(operation) })
      for (const kind of kinds)
        add("stage_change_preserves_other_findings", { items, operation: nat(operation), kind: `Canonical.${kind}` })
    }
  }
// Literal contexts use the production initial history module.
const historyImport = ""
const context = (items, rounds = "Nil{}") =>
  `Canonical.State{Ledger.initial(Ledger.Limits{99n, 999n, 99n, 999n}), ${rounds}, ${items}, 3n, 20n, Nil{}, Dispatch.initial(), CollectionState.initial(), EditHistory.initial()}`
for (const advice of [1, 7, 42])
  for (const other of kinds) {
    const items = list([work(advice, "PendingFinding{2n}"), work(90, other, 10)])
    add("completed_edit_becomes_collectible", {
      state: context(items),
      advice: nat(advice - 1),
      partition: "1n",
      lifetime: "1n",
      round: "2n",
      observation: "9n",
      owned: "{==}",
      completed: "{==}"
    })
  }
for (const outcome of ["Finding", "Clear", "Unavailable", "Interrupted", "Discarded"])
  for (const count of [0, 1, 4, 8]) {
    const members = list(
      Array.from({ length: count }, (_, i) => `Core.Member{${nat(i + 1)}, ${bool(i % 2)}, ${bool(i % 3)}}`)
    )
    add("terminal_owner_resolves_every_member", { members, outcome: `Canonical.${outcome}{}` })
    add("terminal_members_never_remain_pending", { members, outcome: `Canonical.${outcome}{}` })
  }
const entry = (op, preparation) =>
  `Dispatch.ScheduledReviewWork{1n, 1n, 2n, ${nat(op)}, ${nat(op)}, False{}, ${bool(preparation)}}`
for (const count of [0, 1, 3, 8])
  for (const laterCount of [0, 1, 5]) {
    const running = list(Array.from({ length: 8 }, (_, i) => entry(100 + i, true)))
    const prefix = list(Array.from({ length: count }, (_, i) => entry(i + 1, true)))
    const later = list(Array.from({ length: laterCount }, (_, i) => entry(50 + i, false)))
    add("earliest_runnable_cannot_be_overtaken", {
      prefix,
      entry: entry(20, false),
      later,
      running,
      sequence: "99n",
      closed: "False{}",
      requests: "Nil{}",
      waiting: witness(count),
      enabled: "{==}"
    })
  }
for (const count of [0, 1, 4, 8])
  for (const retainedCount of [0, 1, 3]) {
    const charges = list(
      Array.from(
        { length: count },
        (_, i) => `Ledger.ReviewCapacityReservationRecord{${nat(i + 1)}, 1n, ${nat(i + 5)}, Ledger.ReviewUnit{}}`
      )
    )
    const retained = list(
      Array.from(
        { length: retainedCount },
        (_, i) => `Ledger.ReviewCapacityReservationRecord{${nat(100 + i)}, 2n, ${nat(i + 10)}, Ledger.StoredResult{}}`
      )
    )
    add("transient_resources_drain_without_reset", {
      charges,
      retained,
      limits: "Ledger.Limits{99n, 999n, 99n, 999n}",
      next_id: "200n",
      unique: transientWitness(count, retainedCount)
    })
  }
for (const partition of [0, 1, 7])
  for (const size of [0, 1, 15])
    for (const outcome of [
      "NeverSent",
      "RequestFinding",
      "RequestClear",
      "RequestBackendFailure",
      "RequestTimeout",
      "RequestInterrupted"
    ]) {
      add("admitted_edit_reaches_resolution_and_submission", {
        partition: nat(partition),
        size: nat(size),
        fingerprint: "7n",
        limits: `Ledger.Limits{1n, ${nat(size + 1)}, 1n, ${nat(size + 1)}}`,
        outcome: `Canonical.${outcome}{}`,
        room: "{==}"
      })
    }
for (const sequence of [0, 1, 7, 42])
  for (const gap of [0, 1, 7]) add("newer_advice_cannot_sort_before_older", { sequence: nat(sequence), gap: nat(gap) })
for (const kind of kinds)
  for (const owner of [1, 3])
    add("another_edit_does_not_block_collection", {
      items: list([work(7, "PendingFinding{2n}")]),
      partition: "1n",
      lifetime: "1n",
      round: "2n",
      observation: "9n",
      owner: nat(owner),
      generation: "1n",
      current: "2n",
      operation: "10n",
      charge: "1n",
      kind: `Canonical.${kind}`,
      parent: "11n",
      different_operation: "{==}",
      different_parent: "{==}"
    })
for (const count of [0, 1, 4])
  for (const retainedCount of [0, 1, 3])
    for (const purpose of [
      "ObservationDispatch",
      "Preparation",
      "ReviewUnit",
      "StoredResult",
      "OperationalNotice",
      "AdviceRecheck"
    ]) {
      const charges = list(
        Array.from(
          { length: count },
          (_, i) => `Ledger.ReviewCapacityReservationRecord{${nat(i + 1)}, 1n, 5n, Ledger.ReviewUnit{}}`
        )
      )
      const retained = list(
        Array.from(
          { length: retainedCount },
          (_, i) => `Ledger.ReviewCapacityReservationRecord{${nat(i + 100)}, 2n, 10n, Ledger.StoredResult{}}`
        )
      )
      add("released_resources_allow_fresh_capacity", {
        charges,
        retained,
        limits: "Ledger.Limits{8n, 100n, 8n, 100n}",
        next_id: "200n",
        partition: "1n",
        bytes: "7n",
        purpose: `Ledger.${purpose}{}`,
        unique: transientWitness(count, retainedCount),
        available: "{==}"
      })
    }
// Physical request termination includes unrelated work and all lifecycle flags.
for (const seed of [0, 1, 7])
  for (const count of [0, 1, 4]) {
    const common = {
      queued: list([entry(80, true)]),
      running: list([entry(81, false)]),
      sequence: nat(seed),
      closed: bool(seed % 2),
      requests: list(
        Array.from(
          { length: count },
          (_, i) => `Dispatch.ReviewServiceRequestRecord{2n, 3n, 4n, ${nat(100 + i)}, ${nat(200 + i)}, True{}, False{}}`
        )
      )
    }
    const identity = { partition: "1n", lifetime: "1n", round: "2n", operation: "7n", request: "8n" }
    // Exercise settlement behind unrelated prefixes, including a suffix with
    // another identical identity: request_remove removes only the first match.
    for (const started of [false, true])
      for (const interrupted of [false, true])
        for (const suffix of [
          "Nil{}",
          common.requests,
          list([`Dispatch.ReviewServiceRequestRecord{1n, 1n, 2n, 7n, 8n, True{}, False{}}`])
        ]) {
          let unmatched = "Unit{}"
          for (let i = 0; i < count; i++) unmatched = `({==}, ${unmatched})`
          add("physical_settlement_preserves_other_requests", {
            queued: common.queued,
            running: common.running,
            sequence: common.sequence,
            closed: common.closed,
            ...identity,
            prefix: common.requests,
            suffix,
            unmatched,
            started: bool(started),
            interrupted: bool(interrupted)
          })
        }
    add("interruption_keeps_physical_permit", { ...common, ...identity })
    for (const operations of ["Nil{}", "81n <> Nil{}", "80n <> 81n <> Nil{}"])
      add("dispatch_cancellation_keeps_physical_requests", { ...common, operations })
    for (const outcome of [
      "NeverSent",
      "RequestFinding",
      "RequestClear",
      "RequestBackendFailure",
      "RequestTimeout",
      "RequestInterrupted"
    ])
      for (const currentWork of [false, true])
        add("absent_request_terminal_preserves_entire_state", {
          ...common,
          ...identity,
          ledger:
            "Ledger.Ledger{Ledger.Limits{9n, 999n, 9n, 999n}, 50n, Ledger.ReviewCapacityReservationRecord{49n, 2n, 20n, Ledger.StoredResult{}} <> Nil{}}",
          rounds: "Nil{}",
          work: list([work(90, "ReviewServiceRequestOutstanding{}"), work(91, "PendingFinding{2n}")]),
          next_round: "5n",
          next_operation: "99n",
          admissions: "Nil{}",
          collection: "CollectionState.initial()",
          history: "EditHistory.initial()",
          outcome: `Canonical.${outcome}{}`,
          current_work: bool(currentWork),
          absent: "{==}"
        })
  }

// Reuse nat, bool, list, work, kinds, context, add already owned by that script.
for (const seed of [0, 1, 3])
  for (const count of [0, 1, 3, 7]) {
    const items = list(
      Array.from({ length: count }, (_, i) =>
        work(i + 1, kinds[(i + seed) % kinds.length], i % 2 ? 9 : 8, i % 2 ? 1 : 3)
      )
    )
    for (let operation = 0; operation <= count + 1; operation++) {
      add("removal_preserves_all_other_work", { items, operation: nat(operation) })
      for (const kind of kinds)
        add("stage_change_preserves_all_other_work", { items, operation: nat(operation), kind: `Canonical.${kind}` })
    }
    for (const waiting of [false, true])
      for (const uncertain of [false, true])
        for (const write of ["None{}", "Some{5n}"])
          for (const quiet_since of ["None{}", "Some{0n}", "Some{9n}"]) {
            const current = `Canonical.Round{1n, 1n, 2n, ${bool(waiting)}, False{}, ${write}, ${bool(uncertain)}, ${quiet_since}}`
            // Both unrelated rounds and arbitrary work survive admission.
            const rounds = list(["Canonical.Round{3n, 1n, 8n, False{}, False{}, None{}, False{}, None{}}", current])
            add("accepted_observation_is_recorded_without_losing_work", {
              state: context(items, rounds),
              partition: "1n",
              lifetime: "1n",
              round: "2n",
              waiting: bool(waiting),
              write,
              uncertain: bool(uncertain),
              quiet_since,
              current: "{==}"
            })
          }
  }

for (const retained_generation of [1, 2, 9])
  for (const old_generation of [0, 1, 8]) {
    if (retained_generation === old_generation) continue
    for (const members of [0, 1, 3]) {
      add("old_revision_release_preserves_new_registry", {
        entries: `RevisionState.Entry{1n, 7n, ${nat(retained_generation)}, ${nat(members)}} <> RevisionState.Entry{2n, 8n, 99n, 2n} <> Nil{}`,
        next_generation: "100n",
        found: "{==}",
        subject: "1n",
        input: "7n",
        retained_generation: nat(retained_generation),
        old_generation: nat(old_generation),
        members: nat(members),
        different: "{==}"
      })
      for (const input of [7, 8])
        add("old_generation_cannot_become_current_again", {
          entries: `RevisionState.Entry{1n, 7n, ${nat(retained_generation)}, ${nat(members)}} <> RevisionState.Entry{2n, 8n, 99n, 2n} <> Nil{}`,
          next_generation: "100n",
          found: "{==}",
          input: nat(input),
          retained_input: "7n",
          subject: "1n",
          retained_generation: nat(retained_generation),
          old_generation: nat(old_generation),
          members: nat(members),
          different: "{==}"
        })
    }
  }
for (const kind of kinds)
  for (const outcome of ["Finding", "Clear", "Unavailable", "Interrupted", "Discarded"])
    for (const currentWork of [false, true]) {
      const items = list([work(1, kind), work(2, "PendingFinding{2n}")])
      const state = `Canonical.State{Ledger.Ledger{Ledger.Limits{99n, 999n, 99n, 999n}, 3n, Ledger.ReviewCapacityReservationRecord{1n, 1n, 5n, Ledger.ReviewUnit{}} <> Ledger.ReviewCapacityReservationRecord{2n, 1n, 5n, Ledger.StoredResult{}} <> Nil{}}, Nil{}, ${items}, 3n, 20n, Nil{}, Dispatch.initial(), CollectionState.initial(), EditHistory.initial()}`
      add("review_observation_preserves_other_findings", {
        state,
        partition: "1n",
        lifetime: "1n",
        round: "2n",
        operation: "1n",
        outcome: `Canonical.${outcome}{}`,
        current_work: bool(currentWork)
      })
    }

assert.deepEqual(new Set(rows.map((row) => row.name)), new Set(laws.keys()), "literal coverage of every law")
const probes = (selected) =>
  imports +
  historyImport +
  selected
    .map((row, i) =>
      [
        ...row.premises.map((p, j) => `def premise_${i}_${j}() -> ${p.type}:\n  ${p.witness}\n`),
        `def instance_${i}() -> ${row.claim}:\n  {==}\n`
      ].join("\n")
    )
    .join("\n")
const check = (file, verdict = false, env = process.env) => {
  const result = spawnSync("bend", [file, verdict ? "--verdict" : "--check-only"], {
    encoding: "utf8",
    timeout: 5000,
    env
  })
  assert.ifError(result.error)
  return {
    ok: result.status === 0 && result.stdout.includes("ALL PROOFS CHECK"),
    output: result.stdout + result.stderr
  }
}
const temporary = mkdtempSync(join(tmpdir(), "hapsland-journey-"))
try {
  const mirror = join(temporary, "agent-flow-bend")
  cpSync(root, mirror, { recursive: true })
  const scratch = join(mirror, "journey-proof")
  const probe = join(scratch, "instances.bend")
  const checkInstances = (selected) => {
    for (let offset = 0; offset < selected.length; offset += 128) {
      writeFileSync(probe, probes(selected.slice(offset, offset + 128)))
      const result = check(probe)
      assert.ok(result.ok, `literal batch ${offset}: ${result.output}`)
    }
  }
  checkInstances(rows)
  console.log(`${rows.length} instances and their premises passed for ${laws.size} journey laws`)
  if (!process.argv.includes("--falsify-only")) {
    const table = JSON.parse(readFileSync(join(project, "mutants.json"), "utf8"))
    assert.deepEqual(
      new Set(table.map((row) => row.law)),
      new Set(laws.keys()),
      "every law has a compiling false mutant"
    )
    const proof = readFileSync(join(project, "PROOF.bend"), "utf8")
    const header = proof.slice(0, proof.indexOf("# ----"))
    const definitions = [...proof.matchAll(/^def ([\w.]+)\([\s\S]*?(?=^def |$(?![\s\S]))/gm)].map((m) => ({
      name: m[1],
      text: m[0]
    }))
    for (const mutant of table) {
      cpSync(root, mirror, { recursive: true })
      const needed = new Set([`Laws.${mutant.law}`])
      let previous
      do {
        previous = needed.size
        for (const definition of definitions.filter((d) => needed.has(d.name)))
          for (const dependency of definitions)
            if (definition.text.includes(`${dependency.name}(`)) needed.add(dependency.name)
      } while (needed.size !== previous)
      const kept = [...needed].filter((name) => name.startsWith("Laws.")).map((name) => name.slice(5))
      writeFileSync(
        join(scratch, "LAWS.bend"),
        imports + kept.map((name) => `law ${name}:\n${laws.get(name).body}\n`).join("\n")
      )
      const isolated = join(scratch, "PROOF.bend")
      writeFileSync(
        isolated,
        header +
          definitions
            .filter((d) => needed.has(d.name))
            .map((d) => d.text)
            .join("\n")
      )
      assert.ok(check(isolated).ok, `${mutant.law}: isolated positive proof`)
      const target = resolve(scratch, mutant.file)
      const original = readFileSync(target, "utf8")
      assert.equal(original.split(mutant.from).length, 2, `${mutant.law}: unique mutation target`)
      const selected = rows.filter((row) => row.name === mutant.law)
      checkInstances(selected)
      writeFileSync(target, original.replace(mutant.from, mutant.to))
      const compile = check(target)
      assert.ok(compile.ok, `${mutant.law}: mutant compiles: ${compile.output}`)
      let counter
      for (let offset = 0; offset < selected.length; offset += 128) {
        writeFileSync(probe, probes(selected.slice(offset, offset + 128)))
        counter = check(probe)
        if (!counter.ok) break
      }
      assert.ok(
        counter !== undefined && !counter.ok && /Location: instance_/.test(counter.output),
        `${mutant.law}: literal mutant rejected at law instance: ${counter?.output}`
      )
      const rejected = check(isolated)
      const location = mutant.location ?? `Laws.${mutant.law}`
      assert.ok(
        !rejected.ok && rejected.output.includes(`Location: ${location}\n`),
        `${mutant.law}: isolated proof rejected at ${location}: ${rejected.output}`
      )
      console.log(`rejected ${mutant.law} mutant in ${location}${mutant.location ? " (law helper)" : ""}`)
    }
    const proofResult = check(join(project, "PROOF.bend"), true)
    assert.ok(proofResult.ok, proofResult.output)
    const falseKernel = check(join(project, "PROOF.bend"), true, { ...process.env, BENDTT: "/usr/bin/false" })
    assert.ok(!falseKernel.ok, "disabled kernel must fail")
    console.log("Journey proofs passed BendTT; disabled-kernel control failed as required")
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
