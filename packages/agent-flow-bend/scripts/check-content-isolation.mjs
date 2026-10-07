import assert from "node:assert/strict"
import { spawnSync, execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const project = resolve(import.meta.dirname, "../request-content")
const bend = process.env.HAPSLAND_CONTENT_BEND ?? "bend"
const version = spawnSync(bend, ["version"], { encoding: "utf8", timeout: 5_000 })
assert.equal(version.status, 0, version.stderr)
const expectedVersion = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8")).hapsland
  .toolchain.bend.version
assert.equal(version.stdout.trim(), `bend ${expectedVersion}`)
const source = readFileSync(join(project, "LAWS.bend"), "utf8")
const laws = new Map(
  [...source.matchAll(/^law (\w+):\n([\s\S]*?)(?=^law |$(?![\s\S]))/gm)].map(([, name, raw]) => {
    const body = raw.replace(/^#.*\n/gm, "").trimEnd()
    const binders = [...body.matchAll(/^  for \+?(\w+):/gm)].map((match) => match[1])
    const claim = body.slice(body.lastIndexOf("\n  {") + 1).trim()
    const premises = [...body.matchAll(/^  for (equal|different): (\{[^\n]+\})/gm)].map((match) => match[2])
    return [name, { body, binders, claim, premises }]
  })
)
assert.equal(laws.size, 7)
const imports = "import Base\nimport ./core.bend as Core\n"
const instances = []
const add = (name, at) => {
  const law = laws.get(name)
  assert.ok(law, name)
  assert.deepEqual(Object.keys(at).sort(), [...law.binders].sort(), `${name}: exact binders`)
  const pattern = new RegExp(`"(?:\\\\.|[^"\\\\])*"|\\b(${law.binders.join("|")})\\b`, "g")
  const instantiate = (text) => text.replace(pattern, (token) => at[token] ?? token)
  instances.push({ name, claim: instantiate(law.claim), premises: law.premises.map(instantiate) })
}
const quote = (value) => JSON.stringify(value)
const values = ["", "null", "false", "0", '"quoted"', "{}", "[]", '"日本語"']
for (const value of values) {
  for (const fallback of values) {
    const rest = "Nil{}"
    add("lookup_empty", { key: '"state"', fallback: quote(fallback) })
    add("lookup_match", {
      rest,
      key: '"model"',
      name: '"model"',
      value: quote(value),
      fallback: quote(fallback),
      equal: "{==}"
    })
    add("lookup_skip", {
      rest,
      key: '"model"',
      name: '"prompt"',
      value: quote(value),
      fallback: quote(fallback),
      different: "{==}"
    })
    add("encode_exact", { model: quote(value), state: quote(fallback), questions: '"{}"' })
    add("project_exact", {
      fields: `Core.Field{"prompt", ${quote(value)}} <> Core.Field{"state", ${quote(fallback)}} <> Nil{}`
    })
    add("encode_openai_exact", { model: quote(value), input: quote(fallback), questions: '"[]"' })
    add("project_openai_exact", {
      fields: `Core.Field{"prompt", ${quote(value)}} <> Core.Field{"state", ${quote(value)}} <> Core.Field{"input", ${quote(fallback)}} <> Nil{}`
    })
  }
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
    console.log("Production request content: ALL PROOFS CHECK (BendTT kernel)")
  }
  // Exercise the artifact gate against an isolated package tree, never edit the candidate.
  const fixture = join(temporary, "artifact-fixture")
  const fixturePackage = join(fixture, "packages/agent-flow-bend")
  mkdirSync(join(fixturePackage, "scripts"), { recursive: true })
  mkdirSync(join(fixturePackage, "abi"), { recursive: true })
  mkdirSync(join(fixturePackage, "dist"), { recursive: true })
  cpSync(resolve(import.meta.dirname, "../package.json"), join(fixturePackage, "package.json"))
  cpSync(
    resolve(import.meta.dirname, "../abi/request-content.generated.d.ts"),
    join(fixturePackage, "abi/request-content.generated.d.ts")
  )
  cpSync(project, join(fixturePackage, "request-content"), { recursive: true })
  const builder = join(fixturePackage, "scripts/build-request-content.mjs")
  cpSync(resolve(import.meta.dirname, "build-request-content.mjs"), builder)
  const artifact = join(fixturePackage, "dist/request-content.generated.js")
  cpSync(resolve(import.meta.dirname, "../dist/request-content.generated.js"), artifact)
  cpSync(
    resolve(import.meta.dirname, "../dist/request-content.generated.d.ts"),
    join(fixturePackage, "dist/request-content.generated.d.ts")
  )
  const artifactCheck = () =>
    spawnSync(process.execPath, [builder, "--check"], {
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, HAPSLAND_CONTENT_BEND: bend }
    })
  const clean = artifactCheck()
  assert.ifError(clean.error)
  assert.equal(clean.status, 0, clean.stdout + clean.stderr)
  writeFileSync(artifact, readFileSync(artifact, "utf8") + "\n// stale artifact\n")
  const stale = artifactCheck()
  assert.ifError(stale.error)
  assert.equal(stale.status, 1)
  assert.match(stale.stderr, /request-content artifact differs/)
  console.log("Fresh production artifact accepted; modified artifact rejected")
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

execFileSync(process.execPath, [resolve(import.meta.dirname, "build-request-content.mjs"), "--check"], {
  stdio: "inherit",
  timeout: 10000
})
