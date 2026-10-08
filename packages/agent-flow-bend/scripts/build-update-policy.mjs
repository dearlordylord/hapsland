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
execFileSync("bend", [join(root, "update-policy/PROOF.bend"), "--verdict"], { timeout: 5000 })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-update-policy-"))
try {
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [join(root, "update-policy/core.bend"), "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const phases = [
    "Discovering",
    "Targeting",
    "Previewing",
    "Review",
    "Approval",
    "Applying",
    "Activating",
    "Done",
    "Cancelled"
  ]
  const actions = [
    "Discovered",
    "Targeted",
    "ProposalPreviewed",
    "CurrentPreviewed",
    "FailedPreviewed",
    "BusyPreviewed",
    "IndeterminatePreviewed",
    "Continue",
    "Approve",
    "UpdatedObserved",
    "CurrentObserved",
    "PartialObserved",
    "BusyObserved",
    "IndeterminateObserved",
    "FailedObserved",
    "Activated",
    "Back",
    "Exit"
  ]
  const dimensions = Array(10).fill(2)
  const names = [
    "unique",
    "nonempty",
    "matched",
    "validDigest",
    "more",
    "proposals",
    "pending",
    "approvalsMatch",
    "yes",
    "returnPreview"
  ]
  const contexts = Array.from({ length: 1024 }, (_, bits) =>
    names.map((_, axis) => Number(Boolean(bits & (1 << (9 - axis)))))
  )
  const rowIndex = (values) => values.reduce((index, value, axis) => index * dimensions[axis] + value, 0)
  const routes = [],
    ids = new Map(),
    expectedRoutes = new Map()
  const navigationTable = {},
    commandTable = {}
  for (const phase of phases) {
    for (const action of actions) {
      const phaseTag = { $: "Update" + phase },
        actionTag = { $: "Update" + action }
      const full = contexts.map((values) => core.step(phaseTag, actionTag, true, ...values.map(Boolean)))
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
      // The complete Boolean domain is compared above before dropping irrelevant axes.
    }
    const table = {}
    for (const [kind, variants] of Object.entries({
      discovered: { "": "Discovered" },
      targeted: { "": "Targeted" },
      continue: { "": "Continue" },
      approve: { "": "Approve" },
      activated: { "": "Activated" },
      back: { "": "Back" },
      exit: { "": "Exit" },
      previewed: {
        proposal: "ProposalPreviewed",
        current: "CurrentPreviewed",
        failed: "FailedPreviewed",
        busy: "BusyPreviewed",
        indeterminate: "IndeterminatePreviewed"
      },
      observed: {
        updated: "UpdatedObserved",
        "already current": "CurrentObserved",
        partial: "PartialObserved",
        busy: "BusyObserved",
        indeterminate: "IndeterminateObserved",
        failed: "FailedObserved"
      }
    })) {
      const selections = Object.fromEntries(
        Object.entries(variants).map(([tag, action]) => [tag, expectedRoutes.get(phase + ":" + action)])
      )
      const values = Object.values(selections)
      table[kind] = values.every((value) => value === values[0]) ? values[0] : selections
    }
    navigationTable[phase] = table
  }
  const commandNames = {
    UpdateDiscoverCommand: "discover",
    UpdateTargetCommand: "target",
    UpdatePreviewCommand: "preview",
    UpdateApplyCommand: "apply",
    UpdateActivateCommand: "activate",
    UpdateNoCommand: undefined
  }
  for (const phase of phases)
    commandTable[phase] = [false, true].flatMap((agent) =>
      [false, true].map((digest) => {
        const command = core.command({ $: "Update" + phase }, agent, digest)
        assert.ok(Object.hasOwn(commandNames, command.$))
        return commandNames[command.$] ?? null
      })
    )
  const commandTemplate = (kind) => {
    if (kind === null) return "undefined"
    const fields = {
      discover: "id:model.revision",
      target: "id:model.revision",
      preview: "id:model.revision,host:agent.host",
      activate: "id:model.revision,host:agent.host",
      apply: "id:model.revision,host:agent.host,digest:agent.digest"
    }
    assert.ok(Object.hasOwn(fields, kind))
    return `({kind:${JSON.stringify(kind)},${fields[kind]}})`
  }
  const choose = (condition, yes, no) => (yes === no ? yes : `(${condition}?${yes}:${no})`)
  let nativeCommand = "export const updateNativeCommand = model => {switch(model.phase){\n"
  for (const [phase, values] of Object.entries(commandTable)) {
    const templates = values.map(commandTemplate)
    const expression = choose(
      "agent!==undefined",
      choose("Boolean(agent?.digest)", templates[3], templates[2]),
      choose("Boolean(agent?.digest)", templates[1], templates[0])
    )
    nativeCommand += `case ${JSON.stringify(phase)}:{${expression.includes("agent") ? "const agent=model.agents[model.cursor];" : ""}return ${expression};}\n`
  }
  nativeCommand += 'default:throw new TypeError("Unknown update phase");}};\n'
  const expressions = []
  for (let routeId = 0; routeId < routes.length; routeId++) {
    const route = routes[routeId],
      fingerprints = route.plans.map((plan) => JSON.stringify(plan))
    const canonical = fingerprints.map((value) => fingerprints.indexOf(value))
    const costs = {
      unique: 3,
      nonempty: 1,
      matched: 1,
      validDigest: 2,
      more: 1,
      proposals: 3,
      pending: 3,
      approvalsMatch: 3,
      yes: 1,
      returnPreview: 1
    }
    const memo = new Map()
    const tree = (indices, remaining) => {
      if (indices.every((index) => fingerprints[index] === fingerprints[indices[0]]))
        return { expression: `plans[${routeId}][${canonical[indices[0]]}]`, cost: 0 }
      const key = indices.join(",")
      if (memo.has(key)) return memo.get(key)
      let best
      for (const depth of remaining) {
        assert.equal(route.axes[depth].radix, 2)
        const bit = 2 ** (route.axes.length - depth - 1)
        const next = remaining.filter((index) => index !== depth)
        const no = tree(
          indices.filter((index) => (index & bit) === 0),
          next
        )
        const yes = tree(
          indices.filter((index) => (index & bit) !== 0),
          next
        )
        const cost = costs[route.axes[depth].name] + (no.cost + yes.cost) / 2
        if (!best || cost < best.cost)
          best = {
            cost,
            expression: choose(`facts.${route.axes[depth].name}(model,action)`, yes.expression, no.expression)
          }
      }
      assert.ok(best)
      memo.set(key, best)
      return best
    }
    const expression = tree(
      route.plans.map((_, index) => index),
      route.axes.map((_, index) => index)
    ).expression
    expressions.push(expression)
  }
  const patchName = (tag) => {
    const name = tag.slice(6, -5)
    return name[0].toLowerCase() + name.slice(1)
  }
  const reducerExpression = (id) =>
    expressions[id].replace(/plans\[(\d+)\]\[(\d+)\]/g, (_, route, index) => {
      const plan = routes[route].plans[index]
      return plan.$ === "UpdateHold"
        ? "model"
        : `apply.${patchName(plan.patch.$)}(model,action,${JSON.stringify(plan.phase.$.slice(6))})`
    })
  let reducerBinder = "export const updateBindReducers = (facts,readTag,apply)=>(model,action)=>{switch(model.phase){\n"
  for (const [phase, table] of Object.entries(navigationTable)) {
    reducerBinder += `case ${JSON.stringify(phase)}:`
    const selections = Object.values(table)
    if (selections.every((selection) => typeof selection === "number" && selection === selections[0])) {
      reducerBinder += `return ${reducerExpression(selections[0])};\n`
      continue
    }
    reducerBinder += "switch(action.kind){\n"
    for (const [kind, selection] of Object.entries(table)) {
      reducerBinder += `case ${JSON.stringify(kind)}:`
      if (typeof selection === "number") reducerBinder += `return ${reducerExpression(selection)};\n`
      else {
        reducerBinder += "switch(readTag(action)){\n"
        for (const [tag, index] of Object.entries(selection))
          reducerBinder += `case ${JSON.stringify(tag)}:return ${reducerExpression(index)};\n`
        reducerBinder += 'default:throw new TypeError("Unknown update observation");}\n'
      }
    }
    reducerBinder += 'default:throw new TypeError("Unknown update action");}\n'
  }
  reducerBinder += 'default:throw new TypeError("Unknown update phase");}};\n'
  const generated =
    `export const updateRoutes = ${JSON.stringify(routes)};\nexport const updateNavigationTable = ${JSON.stringify(navigationTable)};\n` +
    nativeCommand +
    reducerBinder
  const specializedOutput = join(temporary, "specialized.mjs")
  writeFileSync(specializedOutput, generated)
  const specialized = await import(pathToFileURL(specializedOutput))
  const nativeTags = {
    Discovered: ["discovered", ""],
    Targeted: ["targeted", ""],
    Continue: ["continue", ""],
    Approve: ["approve", ""],
    Activated: ["activated", ""],
    Back: ["back", ""],
    Exit: ["exit", ""],
    ProposalPreviewed: ["previewed", "proposal"],
    CurrentPreviewed: ["previewed", "current"],
    FailedPreviewed: ["previewed", "failed"],
    BusyPreviewed: ["previewed", "busy"],
    IndeterminatePreviewed: ["previewed", "indeterminate"],
    UpdatedObserved: ["observed", "updated"],
    CurrentObserved: ["observed", "already current"],
    PartialObserved: ["observed", "partial"],
    BusyObserved: ["observed", "busy"],
    IndeterminateObserved: ["observed", "indeterminate"],
    FailedObserved: ["observed", "failed"]
  }
  let validationValues = []
  const hold = { $: "UpdateHold" }
  Object.defineProperty(hold, "phase", { value: "", writable: true })
  const boundReducers = specialized.updateBindReducers(
    Object.fromEntries(names.map((name, index) => [name, () => validationValues[index]])),
    (action) => action.tag,
    Object.fromEntries(
      routes
        .flatMap((route) => route.plans)
        .filter((plan) => plan.$ === "UpdateAdvance")
        .map((plan) => [
          patchName(plan.patch.$),
          (_model, _action, phase) => ({
            $: "UpdateAdvance",
            phase: { $: "Update" + phase },
            patch: { $: plan.patch.$ }
          })
        ])
    )
  )
  for (const phase of phases) {
    hold.phase = phase
    for (const agents of [
      [],
      [{ host: "claude" }],
      [{ host: "codex", digest: "" }],
      [{ host: "pi", digest: "a".repeat(64) }]
    ])
      for (const cursor of [-1, 0, 1]) {
        const model = { phase, revision: 37, cursor, agents },
          agent = agents[cursor]
        const kind = commandNames[core.command({ $: "Update" + phase }, agent !== undefined, Boolean(agent?.digest)).$]
        const expected =
          kind === undefined
            ? undefined
            : {
                kind,
                id: 37,
                ...(["preview", "activate", "apply"].includes(kind) ? { host: agent.host } : {}),
                ...(kind === "apply" ? { digest: agent.digest } : {})
              }
        assert.deepEqual(specialized.updateNativeCommand(model), expected)
      }
    for (const action of actions) {
      const [kind, tag] = nativeTags[action],
        selection = specialized.updateNavigationTable[phase][kind]
      const id = typeof selection === "number" ? selection : selection[tag]
      assert.equal(id, expectedRoutes.get(phase + ":" + action))
      const route = specialized.updateRoutes[id]
      for (const values of contexts) {
        validationValues = values
        assert.deepEqual(
          boundReducers(hold, { kind, tag }),
          core.step({ $: "Update" + phase }, { $: "Update" + action }, true, ...values.map(Boolean))
        )
        const index = route.axes.reduce((key, axis) => key * axis.radix + values[names.indexOf(axis.name)], 0)
        assert.deepEqual(
          route.plans[index],
          core.step({ $: "Update" + phase }, { $: "Update" + action }, true, ...values.map(Boolean))
        )
      }
    }
  }
  const target = join(outputDirectory, "update-policy.generated.js"),
    declaration = join(outputDirectory, "update-policy.generated.d.ts"),
    abi = join(root, "abi/update-policy.generated.d.ts")
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
