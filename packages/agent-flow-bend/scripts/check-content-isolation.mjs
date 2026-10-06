import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const project = resolve(import.meta.dirname, "../content-proof")
const bend = process.env.HAPSLAND_CONTENT_BEND ?? "bend"
const version = spawnSync(bend, ["version"], { encoding: "utf8", timeout: 5_000 })
assert.equal(version.status, 0, version.stderr)
assert.equal(version.stdout.trim(), "bend 2.0.35")
const source = readFileSync(join(project, "LAWS.bend"), "utf8")
const laws = new Map(
  [...source.matchAll(/^law (\w+):\n([\s\S]*?)(?=^law |$(?![\s\S]))/gm)].map(([, name, raw]) => {
    const body = raw.replace(/^#.*\n/gm, "").trimEnd()
    const binders = [...body.matchAll(/^  for \+?(\w+):/gm)].map((match) => match[1])
    const claim = body.slice(body.lastIndexOf("\n  {") + 1).trim()
    const premises = [...body.matchAll(/^  for (events_equal|states_equal): (\{[^\n]+\})/gm)].map((match) => match[2])
    return [name, { body, binders, claim, premises }]
  })
)
assert.equal(laws.size, 10)
const imports = "import Base\nimport ./core.bend as Core\n"
const instances = []
const add = (name, at) => {
  const law = laws.get(name)
  assert.ok(law, name)
  assert.deepEqual(Object.keys(at).sort(), [...law.binders].sort(), `${name}: exact binders`)
  const pattern = new RegExp(`\\b(${law.binders.join("|")})\\b`, "g")
  const instantiate = (text) => text.replace(pattern, (name) => at[name])
  instances.push({ name, claim: instantiate(law.claim), premises: law.premises.map(instantiate) })
}
const quote = (value) => JSON.stringify(value)
const priv = (n) =>
  `Core.Private{${["prompt", "conversation", "derived", "inspection", "attribution"].map((field) => quote(`${field}${n}`)).join(", ")}}`
const review = (n) => `Core.Review{"jev-latest", "source${n}", "questions${n}"}`
const envelope = (n, p) => `Core.Envelope{${review(n)}, ${priv(p)}}`
const list = (items) => (items.length ? `${items.join(" <> ")} <> Nil{}` : "Nil{}")
const state = (n, p) =>
  `Core.State{Some{${envelope(n, p)}}, ${priv(p)}, Core.Request{"old", "old-state", "old-rules"} <> Nil{}}`
const trace = (n, p) =>
  list([
    `Core.PrivateChanged{${priv(p)}}`,
    "Core.Send{}",
    "Core.Retry{}",
    "Core.Cancel{}",
    "Core.Send{}",
    `Core.Stage{${envelope(n + 1, p)}}`,
    "Core.Send{}",
    `Core.Recover{${envelope(n + 2, p)}}`,
    "Core.Retry{}"
  ])
for (const n of [0, 1, 9])
  for (const p of [0, 2, 7]) {
    add("projection_exact", {
      model: '"jev-latest"',
      state: quote(`source${n}`),
      questions: quote(`questions${n}`),
      private: priv(p)
    })
    add("projection_noninterference", { review: review(n), left: priv(p), right: priv(p + 1) })
    add("projection_erasure", { envelope: envelope(n, p) })
    add("transmission_exact", {
      envelope: envelope(n, p),
      private: priv(p + 1),
      sent: 'Core.Request{"previous", "state", "rules"} <> Nil{}'
    })
    for (const pending of [state(n, p), `Core.State{None{}, ${priv(p)}, Nil{}}`]) {
      add("cancellation_has_no_fallback", { state: pending })
      for (const event of [
        `Core.Stage{${envelope(n + 1, p)}}`,
        `Core.Recover{${envelope(n + 2, p)}}`,
        `Core.PrivateChanged{${priv(p + 1)}}`,
        "Core.Send{}",
        "Core.Retry{}",
        "Core.Cancel{}"
      ]) {
        add("step_erasure", { event, state: pending })
      }
      add("private_event_stutters", { state: pending, private: priv(p + 1) })
      for (const events of ["Nil{}", trace(n, p)]) {
        add("trace_erasure", { events, state: pending })
        add("trace_private_stuttering", { events, state: pending })
      }
    }
    add("trace_noninterference", {
      left: trace(n, p),
      right: `Core.PrivateChanged{${priv(p + 2)}} <> ${trace(n, p + 1)}`,
      ls: state(n, p),
      rs: state(n, p + 1),
      events_equal: "{==}",
      states_equal: "{==}"
    })
  }
const probes = (rows) =>
  imports +
  rows
    .map((row, i) =>
      [
        ...row.premises.map((premise, p) => `def premise_${i}_${p}() -> ${premise}:\n  {==}\n`),
        `def instance_${i}() -> ${row.claim}:\n  {==}\n`
      ].join("\n")
    )
    .join("\n")
const check = (file, verdict = false) => {
  const result = spawnSync(bend, [file, verdict ? "--verdict" : "--check-only"], { encoding: "utf8", timeout: 5_000 })
  assert.ifError(result.error)
  const output = result.stdout + result.stderr
  return { ok: result.status === 0 && result.stdout.includes("ALL PROOFS CHECK"), output }
}
const temporary = mkdtempSync(join(tmpdir(), "hapsland-content-"))
try {
  cpSync(project, temporary, { recursive: true })
  const probe = join(temporary, "instances.bend")
  writeFileSync(probe, probes(instances))
  const checked = check(probe)
  assert.ok(checked.ok, checked.output)
  console.log(`${instances.length} law instances and all relational premises passed`)
  if (!process.argv.includes("--falsify-only")) {
    const mutants = JSON.parse(readFileSync(join(project, "mutants.json"), "utf8"))
    assert.deepEqual(new Set(mutants.map((row) => row.law)), new Set(laws.keys()), "every law needs a mutant")
    const proof = readFileSync(join(project, "PROOF.bend"), "utf8")
    const definitions = [...proof.matchAll(/^def ([\w.]+)\([\s\S]*?(?=^def |$(?![\s\S]))/gm)].map((match) => ({
      name: match[1],
      text: match[0]
    }))
    for (const mutant of mutants) {
      cpSync(project, temporary, { recursive: true })
      const needed = new Set([`Laws.${mutant.law}`])
      let size
      do {
        size = needed.size
        for (const definition of definitions.filter((item) => needed.has(item.name))) {
          for (const dependency of definitions)
            if (definition.text.includes(`${dependency.name}(`)) needed.add(dependency.name)
        }
      } while (needed.size !== size)
      writeFileSync(
        join(temporary, "LAWS.bend"),
        imports +
          [...laws]
            .filter(([name]) => needed.has(`Laws.${name}`))
            .map(([name, law]) => `law ${name}:\n${law.body}\n`)
            .join("\n")
      )
      const isolated = join(temporary, "PROOF.bend")
      writeFileSync(
        isolated,
        imports +
          "import ./LAWS.bend as Laws\n" +
          definitions
            .filter((item) => needed.has(item.name))
            .map((item) => item.text)
            .join("\n")
      )
      const control = check(isolated)
      assert.ok(control.ok, `${mutant.law}: isolated original proof: ${control.output}`)
      const selected = instances.filter((row) => row.name === mutant.law)
      writeFileSync(probe, probes(selected))
      assert.ok(check(probe).ok, `${mutant.law}: original instances and premises`)
      const target = join(temporary, "core.bend")
      const original = readFileSync(target, "utf8")
      assert.equal(original.split(mutant.before).length, 2, `${mutant.law}: unique mutation`)
      writeFileSync(target, original.replace(mutant.before, mutant.after))
      const compiled = check(target)
      assert.ok(compiled.ok, `${mutant.law}: mutant must compile: ${compiled.output}`)
      const counter = check(probe)
      assert.ok(
        !counter.ok && /Location: instance_/.test(counter.output),
        `${mutant.law}: literal mutant escaped: ${counter.output}`
      )
      const rejected = check(isolated)
      assert.ok(
        !rejected.ok && rejected.output.includes(`Location: ${mutant.location}\n`),
        `${mutant.law}: wrong failure: ${rejected.output}`
      )
      console.log(
        `${mutant.law}: compiling mutant rejected at ${mutant.location}${mutant.note ? ` (${mutant.note})` : ""}`
      )
    }
    const checkedProof = check(join(project, "PROOF.bend"), true)
    assert.ok(checkedProof.ok, checkedProof.output)
    const kernelControl = spawnSync(bend, [join(project, "PROOF.bend"), "--verdict"], {
      encoding: "utf8",
      timeout: 5_000,
      env: { ...process.env, BENDTT: "/usr/bin/false" }
    })
    assert.ifError(kernelControl.error)
    assert.equal(kernelControl.status, 1, "disabling the proof kernel must fail the gate")
    assert.match(kernelControl.stdout + kernelControl.stderr, /SOME PROOFS FAIL/)
    console.log("Content isolation: ALL PROOFS CHECK (BendTT kernel)")
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
