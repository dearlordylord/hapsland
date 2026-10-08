import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { join, resolve } from "node:path"
const root = resolve(import.meta.dirname, "..")
const outputDirectory = resolve(process.argv.slice(2).find((a) => a !== "--check") ?? join(root, "dist"))
const expectedVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).hapsland.toolchain.bend.version
assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(), `bend ${expectedVersion}`)
execFileSync("bend", [join(root, "setup-policy/PROOF.bend"), "--verdict"], { timeout: 5000 })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-setup-policy-"))
try {
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [join(root, "setup-policy/core.bend"), "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const phases = [
    "Previewing",
    "HookApproval",
    "RulesApproval",
    "Applying",
    "Activating",
    "Verifying",
    "Diagnosing",
    "Done",
    "Cancelled",
    "Back",
    "Failed"
  ]
  const actions = {
    progressed: "Progressed",
    previewed: "Previewed",
    applied: "Applied",
    approveHooks: "ApproveHooks",
    approveRules: "ApproveRules",
    activated: "Activated",
    stale: "Stale",
    failed: "ActionFailed",
    verified: "Verified",
    diagnosed: "Diagnosed",
    back: "NavigateBack",
    exit: "Exit"
  }
  const names = [
    "compatOk",
    "proceed",
    "written",
    "pending",
    "installDigest",
    "installPresent",
    "rulesDigest",
    "digestMatch",
    "yes",
    "ready",
    "cancelled",
    "partial",
    "sequenceNext",
    "succeeded"
  ]
  const contexts = Array.from({ length: 2 ** names.length }, (_, bits) =>
    names.map((_, axis) => Boolean(bits & (1 << (names.length - axis - 1))))
  )
  const index = (values) => values.reduce((n, v) => n * 2 + Number(v), 0)
  const phaseTag = (phase) => ({ $: "Setup" + phase })
  const patchName = (tag) => {
    const s = tag.slice(5, -5)
    return s[0].toLowerCase() + s.slice(1)
  }
  const exits = {
    SetupKeepExit: "undefined",
    SetupExitZero: "0",
    SetupExitThree: "3",
    SetupExitFour: "4",
    SetupExitFive: "5",
    SetupExitSix: "6"
  }
  const leaf = (plan) =>
    plan.$ === "SetupHold"
      ? "model"
      : plan.$ === "SetupProgress"
        ? "apply.progress(model,action)"
        : `apply.${patchName(plan.patch.$)}(model,action,${JSON.stringify(plan.phase.$.slice(5))},${exits[plan.exit.$]})`
  const choose = (test, yes, no) => (yes === no ? yes : `(${test}?${yes}:${no})`)
  const costs = { compatOk: 2, proceed: 2, written: 2, pending: 2, ready: 8, cancelled: 2, partial: 1 }
  const expressions = new Map(),
    rows = new Map()
  for (const phase of phases)
    for (const [kind, constructor] of Object.entries(actions)) {
      const plans = contexts.map((values) => core.step(phaseTag(phase), phaseTag(constructor), true, ...values))
      const strings = plans.map(leaf)
      const axes = names.flatMap((name, axis) =>
        contexts.some((values, i) => {
          const base = [...values]
          base[axis] = false
          return strings[i] !== strings[index(base)]
        })
          ? [{ axis, name }]
          : []
      )
      const compact = []
      contexts.forEach((values, i) => {
        const key = axes.reduce((n, { axis }) => n * 2 + Number(values[axis]), 0)
        if (compact[key] === undefined) compact[key] = strings[i]
        else assert.equal(compact[key], strings[i])
      })
      const memo = new Map()
      function tree(indices, remaining) {
        if (indices.every((i) => compact[i] === compact[indices[0]]))
          return { expression: compact[indices[0]], cost: 0 }
        const key = indices.join(",")
        if (memo.has(key)) return memo.get(key)
        let best
        for (const depth of remaining) {
          const bit = 2 ** (axes.length - depth - 1),
            next = remaining.filter((x) => x !== depth)
          const no = tree(
              indices.filter((i) => (i & bit) === 0),
              next
            ),
            yes = tree(
              indices.filter((i) => (i & bit) !== 0),
              next
            )
          const cost = (costs[axes[depth].name] ?? 1) + (no.cost + yes.cost) / 2
          if (!best || cost < best.cost)
            best = {
              cost,
              expression: choose(`facts.${axes[depth].name}(model,action)`, yes.expression, no.expression)
            }
        }
        assert.ok(best)
        memo.set(key, best)
        return best
      }
      expressions.set(
        phase + ":" + kind,
        tree(
          compact.map((_, i) => i),
          axes.map((_, i) => i)
        ).expression
      )
      rows.set(phase + ":" + kind, strings)
      assert.equal(core.step(phaseTag(phase), phaseTag(constructor), false, ...contexts[0]).$, "SetupHold")
    }
  let command = "export const setupNativeCommand=model=>{switch(model.phase){\n"
  const commands = {
    SetupPreview: "preview",
    SetupApply: "apply",
    SetupActivate: "activate",
    SetupVerify: "verify",
    SetupDiagnose: "diagnose",
    SetupNoCommand: undefined
  }
  for (const phase of phases) {
    const kind = commands[core.command(phaseTag(phase)).$]
    if (kind !== undefined)
      command += `case ${JSON.stringify(phase)}:return {kind:${JSON.stringify(kind)},id:model.revision};\n`
  }
  command += "default:return undefined;}};\n"
  let reducer =
    'export const setupBindReducer=(facts,apply)=>(model,event)=>{const action=event.action;if(event.revision!==model.revision||("commandId" in action&&action.commandId!==model.revision))return model;switch(model.phase){\n'
  for (const phase of phases) {
    const branches = Object.keys(actions)
      .flatMap((kind) => {
        const expression = expressions.get(phase + ":" + kind)
        return expression === "model" ? [] : [`case ${JSON.stringify(kind)}:return ${expression};\n`]
      })
      .join("")
    reducer += `case ${JSON.stringify(phase)}:${branches ? `switch(action.kind){\n${branches}default:return model;}\n` : "return model;\n"}`
  }
  reducer += 'default:throw new TypeError("Unknown setup phase");}};\n'
  const statuses = [
    ["Complete", "complete"],
    ["Pending", "pending"],
    ["Partial", "partial"],
    ["Skipped", "skipped"],
    ["Missing", undefined],
    ["Other", "unrecognized-status"]
  ]
  const literal = (value) => (value === undefined ? "undefined" : JSON.stringify(value))
  const predicate = (fn, expression) =>
    statuses
      .filter(([tag]) => core[fn](phaseTag(tag)))
      .map(([, value]) => `${expression}===${literal(value)}`)
      .join("||") || "false"
  const classifiers = `export const setupInstallationCanProceed=status=>(${predicate("installation_can_proceed", "status")});\nexport const setupInstallationWasWritten=status=>(${predicate("installation_was_written", "status")});\n`
  const readyTerms = ["installation", "credential", "repository", "rules"].map(
    (stage) =>
      `(${predicate(stage === "rules" ? "rules_ready" : "complete", `readStage(observation,${JSON.stringify(stage)})`)})`
  )
  const readiness = `export const setupReadiness=(readStage,observation)=>${readyTerms.join("&&")};\n`
  const generated = command + reducer + classifiers + readiness
  const artifact = join(temporary, "specialized.mjs")
  writeFileSync(artifact, generated)
  const specialized = await import(pathToFileURL(artifact))
  let values = []
  const model = { $: "SetupHold", phase: "", revision: 17 }
  const materializers = Object.fromEntries(
    [
      "no",
      "preview",
      "append",
      "freshProposal",
      "installApproval",
      "rulesApproval",
      "clearApprovals",
      "activated",
      "verification",
      "diagnosis",
      "failedActivation"
    ].map((name) => [
      name,
      (_model, _action, phase, exit) =>
        `apply.${name}(model,action,${JSON.stringify(phase)},${exit === undefined ? "undefined" : exit})`
    ])
  )
  materializers.progress = () => "apply.progress(model,action)"
  const bound = specialized.setupBindReducer(
    Object.fromEntries(names.map((name, i) => [name, () => values[i]])),
    materializers
  )
  for (const phase of phases) {
    model.phase = phase
    const kind = commands[core.command(phaseTag(phase)).$]
    assert.deepEqual(specialized.setupNativeCommand(model), kind === undefined ? undefined : { kind, id: 17 })
    for (const kind of Object.keys(actions))
      for (let i = 0; i < contexts.length; i++) {
        values = contexts[i]
        const action = { kind, commandId: 17 }
        assert.equal(
          bound(model, { revision: 17, action }),
          rows.get(phase + ":" + kind)[i] === "model" ? model : rows.get(phase + ":" + kind)[i]
        )
      }
    assert.equal(bound(model, { revision: 18, action: { kind: "failed" } }), model)
    assert.equal(bound(model, { revision: 17, action: { kind: "failed", commandId: 18 } }), model)
  }
  for (const [tag, status] of statuses) {
    assert.equal(specialized.setupInstallationCanProceed(status), core.installation_can_proceed(phaseTag(tag)))
    assert.equal(specialized.setupInstallationWasWritten(status), core.installation_was_written(phaseTag(tag)))
  }
  for (const a of statuses)
    for (const b of statuses)
      for (const c of statuses)
        for (const d of statuses) {
          const observation = Object.fromEntries(
            ["installation", "credential", "repository", "rules"].map((name, i) => [name, [a, b, c, d][i][1]])
          )
          assert.equal(
            specialized.setupReadiness((o, name) => o[name], observation),
            core.observation_ready(...[a, b, c, d].map(([tag]) => phaseTag(tag)))
          )
        }
  const target = join(outputDirectory, "setup-policy.generated.js"),
    declaration = join(outputDirectory, "setup-policy.generated.d.ts"),
    abi = join(root, "abi/setup-policy.generated.d.ts")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(target, "utf8"), generated)
    assert.ok(readFileSync(declaration).equals(readFileSync(abi)))
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(target, generated)
    copyFileSync(abi, declaration)
  }
  console.log(
    JSON.stringify({
      transitionSpecializationCases: phases.length * Object.keys(actions).length * contexts.length,
      artifactBytes: Buffer.byteLength(generated)
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
