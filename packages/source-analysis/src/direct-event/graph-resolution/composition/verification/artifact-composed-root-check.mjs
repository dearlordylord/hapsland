import { artifactValueTag } from "@hapsland/source-artifacts/direct-event/value/codec"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, lstat, rm } from "node:fs/promises"
import { join, dirname } from "node:path"
import { pathToFileURL } from "node:url"
import * as Effect from "effect/Effect"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import { resolveGraphUnit } from "@hapsland/source-analysis/testing/native-graph"
import { eligibleNamedPath, DEFAULT_DIRECT_FILE_POLICY } from "@hapsland/native-observation/direct-event/selection"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import {
  createGraphServiceRegistry as createServiceRegistry,
  createBendResolver
} from "@hapsland/source-analysis/direct-event/graph-resolution"
import { createGraphDriver } from "@hapsland/source-analysis/direct-event/graph-resolution/composition"
import { createArtifactMachine } from "../artifact-dispatcher.mjs"
const temp = await mkdtemp("/tmp/hapsland-composed-root-")
try {
  let machine
  {
    const artifacts = {}
    for (const [key, name] of [
      ["composition", "GraphCompositionEntry"],
      ["parent", "GenericGraphEntry"],
      ["python", "PythonGraphEntry"]
    ]) {
      const emitted = join(temp, name + ".mjs")
      execFileSync(
        "taskset",
        [
          "-c",
          "10",
          "bend",
          new URL(
            {
              GraphCompositionEntry: "../../GraphCompositionEntry.bend",
              GenericGraphEntry: "../../GenericGraphEntry.bend",
              PythonGraphEntry: "../../PythonGraphEntry.bend"
            }[name],
            import.meta.url
          ).pathname,
          "-o",
          emitted
        ],
        { timeout: 10000 }
      )
      artifacts[key] = (await import(pathToFileURL(emitted))).default
    }
    const split = createArtifactMachine(artifacts)
    const shadowPath = join(temp, "shadow.mjs")
    execFileSync(
      "taskset",
      ["-c", "10", "bend", join(import.meta.dirname, "../../ComposedMachine.bend"), "-o", shadowPath],
      { timeout: 10000 }
    )
    const shadow = (await import(pathToFileURL(shadowPath))).default
    const observation = (step) => (step.$ === "Types.AwaitService" ? { kind: step.$, request: step.request } : step)
    const compare = (pair) => {
      assert.deepEqual(
        observation(split.view(pair.split)),
        observation(shadow.view(pair.shadow)),
        "reachable split/monolithic observation"
      )
      return pair
    }
    machine = {
      kind: split.kind,
      initial: (input) => compare({ split: split.initial(input), shadow: shadow.initial(input) }),
      resume: (state, event) =>
        compare({ split: split.resume(state.split, event), shadow: shadow.resume(state.shadow, event) }),
      view: (state) => split.view(state.split),
      awaitingRequest: (state) => split.awaitingRequest(state.split),
      dispose: split.dispose,
      disposeInvocation: split.disposeInvocation,
      get retainedHandles() {
        return split.retainedHandles
      }
    }
  }
  const ownerPath = join(temp, "owner.mjs")
  execFileSync(
    "taskset",
    [
      "-c",
      "10",
      "bend",
      new URL("../../../../../../agent-flow-bend/preparation-lifecycle/CanonicalResolverOwner.bend", import.meta.url)
        .pathname,
      "-o",
      ownerPath
    ],
    { timeout: 10000 }
  )
  const owner = (await import(pathToFileURL(ownerPath))).default
  let ownerState = owner.initial_limits(100n, 100000000n, 100n, 100000000n)
  const canonical = (name, fields) => ({ $: "../Canonical." + name, ...fields })
  for (const event of [
    canonical("OpenRound", { partition: 1n, lifetime: 1n }),
    canonical("AdmitObservation", { partition: 1n, lifetime: 1n, round: 1n }),
    canonical("StartObservation", { partition: 1n, lifetime: 1n, round: 1n, observation: 1n }),
    canonical("BeginObservedPreparation", { partition: 1n, lifetime: 1n, round: 1n, observation: 1n, bytes: 1000n })
  ]) {
    const step = owner.canonical_event(ownerState, event)
    assert.equal(step.$, "Advanced")
    ownerState = step.state
  }
  const registry = createServiceRegistry(),
    operations = []
  let activeState,
    fences = 0,
    terminalSuffixes = 0
  const t = (name, fields = {}) => ({ $: artifactValueTag(name) ?? "Types." + name, ...fields })
  const guarded = {
    ...machine,
    awaitingRequest(state) {
      activeState = state
      return machine.awaitingRequest(state)
    },
    view(state) {
      activeState = state
      const projection = machine.view(state)
      if (projection.$ !== "Types.AwaitService") {
        assert.equal(
          machine.view(machine.resume(state, t("CancelInvocation", { invocation: 0n }))).failure.$,
          "Types.ReplyAfterTerminal"
        )
        assert.equal(
          machine.view(
            machine.resume(
              state,
              t("ServiceReply", {
                reply: t("Reply", {
                  invocation: 0n,
                  id: 0n,
                  outcome: t("ClockRead", { bits: t("Binary64", { high: 0, low: 0 }) })
                })
              })
            )
          ).failure.$,
          "Types.ReplyAfterTerminal"
        )
      }
      if (projection.$ !== "Types.AwaitService") terminalSuffixes += 2
      return projection
    }
  }
  const driver = createGraphDriver({
    owner,
    initialState: ownerState,
    scope: { $: "Scope", partition: 1n, lifetime: 1n, round: 1n, preparation: 2n },
    machine: guarded,
    registry,
    foreign: async ([request], options) => {
      operations.push(request.operation.$)
      const reply = await registry.perform(request, options)
      const cancelled = machine.resume(activeState, t("CancelInvocation", { invocation: request.invocation }))
      assert.equal(machine.view(cancelled).failure.$, "Types.InvocationCancelled")
      assert.equal(
        machine.view(machine.resume(cancelled, t("CancelInvocation", { invocation: request.invocation }))).failure.$,
        "Types.ReplyAfterTerminal"
      )
      assert.equal(
        machine.view(machine.resume(cancelled, t("ServiceReply", { reply }))).failure.$,
        "Types.ReplyAfterTerminal"
      )
      assert.equal(
        machine.view(machine.resume(activeState, t("ServiceReply", { reply: { ...reply, id: reply.id + 1n } }))).failure
          .$,
        "Types.WrongCorrelation"
      )
      assert.equal(
        machine.view(
          machine.resume(activeState, t("ServiceReply", { reply: { ...reply, invocation: reply.invocation + 1n } }))
        ).failure.$,
        "Types.WrongInvocation"
      )
      fences += 5
      return reply
    }
  })
  const resolver = createBendResolver({
    allocateInvocation: () => driver.allocateInvocation(),
    onConstructionFailure: driver.constructionFailed,
    drive: driver.drive
  })
  let cases = 0
  for (const [index, fixture] of [
    { branch: "type", text: "class Root:\n value: str\n" },
    { branch: "type", text: "class Leaf:\n id: str\nclass Root:\n leaf: Leaf\n" },
    { branch: "function", text: "def Root():\n return 1\n" },
    { branch: "type", text: "class Root:\n value: str\n", limits: { files: 0 } },
    { branch: "type", text: "class Root:\n value: str\n", limits: { readBytes: 0 } },
    { branch: "type", text: "class Root:\n value: str\n", cache: true },
    {
      branch: "type",
      text: "from leaf import Foo\nclass Root:\n value: Foo\n",
      files: { "leaf.py": "class Foo:\n id: str\n" }
    },
    {
      branch: "type",
      text: "from pkg import Foo\nclass Root:\n value: Foo\n",
      files: { "pkg/__init__.py": "from .leaf import Foo\n", "pkg/leaf.py": "class Foo:\n id: str\n" }
    },
    {
      branch: "type",
      text: "from pkg import Foo\nclass Root:\n value: Foo\n",
      files: { "pkg/__init__.py": "from .leaf import Bar as Foo\n", "pkg/leaf.py": "class Bar:\n id: str\n" }
    },
    { branch: "type", text: "from absent import Foo\nclass Root:\n value: Foo\n" },
    ...[
      { files: 1 },
      { files: 2 },
      { files: 3 },
      { work: 1 },
      { work: 3 },
      { work: 8 },
      { sourceBytes: 16 },
      { readBytes: 80, sourceBytes: 80 }
    ].map((limits) => ({
      branch: "type",
      text: "from pkg import Foo\nclass Root:\n value: Foo\n",
      files: { "pkg/__init__.py": "from .leaf import Foo\n", "pkg/leaf.py": "class Foo:\n id: str\n" },
      limits
    }))
  ].entries()) {
    const root = join(temp, String(index))
    await mkdir(root)
    execFileSync("git", ["init", "-q", root], { timeout: 5000 })
    await writeFile(join(root, "root.py"), fixture.text)
    for (const [path, text] of Object.entries(fixture.files ?? {})) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), text)
    }
    const a = await lstat(root),
      b = await lstat(join(root, ".git"))
    const rootIdentity = {
      rootDevice: String(a.dev),
      rootInode: String(a.ino),
      gitDirectory: join(root, ".git"),
      gitDevice: String(b.dev),
      gitInode: String(b.ino)
    }
    const selection = await Effect.runPromise(
      eligibleNamedPath(root, "root.py", DEFAULT_DIRECT_FILE_POLICY, rootIdentity)
    )
    const captured = await Effect.runPromise(captureStable(root, selection, {}, rootIdentity))
    assert.equal(captured.status, "captured")
    const context = {
      root,
      rootIdentity,
      policy: DEFAULT_DIRECT_FILE_POLICY,
      branch: fixture.branch,
      limits: { ...GRAPH_LIMIT_CEILINGS, ...fixture.limits },
      now: () => 0
    }
    const expected = await Effect.runPromise(
      resolveGraphUnit("root.py", captured.capture, "Root", {
        ...context,
        ...(fixture.cache ? { captureCache: new Map() } : {})
      })
    )
    const actual = await resolver("root.py", captured.capture, "Root", {
      ...context,
      ...(fixture.cache ? { captureCache: new Map() } : {})
    })
    assert.deepEqual(actual, expected, "full root ReviewUnit " + index)
    cases++
  }
  assert.equal(registry.size, 0)
  assert.equal(driver.stats.accepted, cases)
  assert.equal(driver.stats.providerStarts, driver.stats.providerCleanups)
  assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
  machine.dispose?.()
  if (machine.retainedHandles !== undefined) assert.equal(machine.retainedHandles, 0)
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      requests: operations.length,
      fences,
      terminalSuffixes,
      splitArtifacts: true,
      canonicalAccepted: driver.stats.accepted,
      scope:
        "actual Canonical child lifecycle/result acceptance and resolveGraphUnit Python root/module/reexport consumer, split/monolithic equality, preparation/cache/import/inspect; capture census/terminal revalidation and per-Await cancellation/wrong identity refusal; finite qualification, whole resident production adoption and universal proofs remain open"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
