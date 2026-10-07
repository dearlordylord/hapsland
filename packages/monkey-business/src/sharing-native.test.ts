import { expect, it } from "vitest"
import { createRun, restoreReplay, DEFAULT_FILE_TREE_PROFILE, type RunInput } from "./index.ts"
import {
  runWorkloadNative,
  runWorkloadEmitted,
  readRetainedWorkloadOutput
} from "../../monkey-business-bend/conformance/workload-native-runner.mjs"
import { validateSharingControl, type SharingControl } from "./sharing-controls.ts"
import { callbackPublicBoundary } from "./callback-native-codec.ts"
import { decodeNativePrefix } from "./callback-native-prefix.ts"
import { decodeSharingNativeBoundary } from "./sharing-native-boundary.ts"
import { readRecord } from "@hapsland/canonical-policy/canonical/boundary-schema"

const programs = [
  "baseline",
  "joined-leaves",
  "owner-leaves",
  "other-partition",
  "all-leave",
  "join-advice",
  "superseded-member"
] as const
const bendList = (values: readonly unknown[]): unknown =>
  values.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const none = { $: "None" }
const originalEdit = (
  agent: string,
  at = 0,
  prepared = "same-prepared-identity",
  subject = "same-subject",
  input = "same-input"
) =>
  ({
    kind: "edit",
    agent,
    at,
    bytes: 10,
    unitBytes: [5],
    evaluationInputs: [prepared],
    revisionSubject: subject,
    revisionInput: input
  }) satisfies RunInput
function inputs(mode: number) {
  if (mode === 6)
    return [
      originalEdit("a", 0, "shared", "owner-subject", "owner-input"),
      originalEdit("a", 0, "shared", "member-subject", "old"),
      originalEdit("a", 3, "changed", "member-subject", "new")
    ]
  const edits = [originalEdit("a"), originalEdit("a", mode === 5 ? 10 : 0)]
  if (mode === 3) edits.push(originalEdit("b"))
  return edits
}
const graphLimits = {
  version: 1 as const,
  sourceBytes: 262144,
  treeBytes: 20480,
  files: 8,
  readBytes: 1572864,
  outgoingEdges: 16,
  depth: 4,
  work: 128
}
function originalRun(mode: number) {
  if (mode === 6)
    return createRun({
      retention: 3000,
      inputs: inputs(mode),
      preparationDelay: 2,
      jevDelay: 30,
      outcome: "finding",
      sessions: [
        { agent: "a", seed: 11, editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000, bytes: 10, unitBytes: [5] }
      ],
      lifecycles: { reuse: { entryLimit: 8, byteLimit: 1 } }
    })
  return createRun({
    seed: 7,
    retention: 3000,
    inputs: inputs(mode),
    preparationDelay: 2,
    jevDelay: mode === 5 ? 5 : 30,
    outcome: "finding",
    sessions: [
      {
        agent: "a",
        seed: 11,
        editIntervalMs: 1000,
        variationMs: 0,
        editsPerTask: 100,
        taskPauseMs: 1000,
        adviceResponse: "ignore"
      },
      {
        agent: "b",
        seed: 12,
        editIntervalMs: 1000,
        variationMs: 0,
        editsPerTask: 100,
        taskPauseMs: 1000,
        adviceResponse: "ignore"
      }
    ],
    fileTrees: {
      ...DEFAULT_FILE_TREE_PROFILE,
      minFiles: 1,
      maxFiles: 1,
      maxImports: 0,
      minSourceBytes: 100,
      maxSourceBytes: 100,
      minTreeBytes: 20,
      maxTreeBytes: 20
    },
    graphLimits,
    lifecycles: { reuse: { entryLimit: 8, byteLimit: 1 } }
  })
}

// These original input literals are independent of the native scenario module
// and of public-recorded events. A changed native seed/profile/config cannot
// conceal a semantic difference by rewriting the observation oracle.
function frozenNativeInput(mode: number) {
  const superseded = mode === 6
  const sessions = (superseded ? ["a"] : ["a", "b"]).map((agent, index) => ({
    $: "sharing_original_inputs.SessionInput",
    agent,
    identity: index + 1,
    profile: {
      $: "Workload.Profile",
      settings: {
        $: "Session.Settings",
        interval: superseded ? 1000000 : 1000,
        variation: 0,
        edits: superseded ? 1000 : 100,
        pause: superseded ? 500 : 1000,
        response: 0,
        repairDelay: 300
      },
      seed: index + 11,
      codes: bendList([agent.charCodeAt(0)]),
      bytes: superseded ? 10 : 100,
      units: bendList([superseded ? 5 : 100]),
      duration: none
    }
  }))
  const tree = {
    $: "TreeFacts.Profile",
    min_files: superseded ? 3 : 1,
    max_files: superseded ? 8 : 1,
    max_imports: superseded ? 3 : 0,
    max_depth: 3,
    denied_percent: 15,
    missing_percent: 0,
    unreadable_percent: 0,
    repeated_percent: 0,
    cyclic_percent: 0,
    unsupported_percent: 0,
    deadline_step: 0,
    local_work: 0,
    min_source: superseded ? 512 : 100,
    max_source: superseded ? 4096 : 100,
    min_tree: superseded ? 256 : 20,
    max_tree: superseded ? 2048 : 20
  }
  const advance = (endpoint: number, budget: number) => ({ $: "sharing_original_inputs.Advance", endpoint, budget })
  const boundaries: unknown[] = superseded ? [advance(2, 500), advance(33, 800)] : [advance(2, 600)]
  if (mode === 1 || mode === 2)
    boundaries.push({ $: "sharing_original_inputs.Leave", agent: "a", admission_index: mode === 1 ? 1 : 0 })
  if (mode === 3 || mode === 4) boundaries.push({ $: "sharing_original_inputs.LeaveAll", agent: "a" })
  if (!superseded) boundaries.push(advance(3, 200), advance(33, 1000))
  return {
    $: "sharing_original_inputs.Scenario",
    configuration: {
      $: "sharing_original_inputs.Configuration",
      seed: superseded ? 1 : 7,
      limits: {
        $: "Ledger.Limits",
        global_items: 32,
        global_bytes: 100000,
        partition_items: 16,
        partition_bytes: 50000
      },
      retention: 3000,
      sessions: bendList(sessions),
      tree,
      graph: {
        $: "ImportGraph.Limits",
        version: 1,
        source_bytes: 262144,
        tree_bytes: 20480,
        files: 8,
        read_bytes: 1572864,
        outgoing_edges: 16,
        depth: 4,
        work: 128
      },
      preparation_delay: 2,
      output_delay: 0,
      output_lease: 30000,
      reuse_entries: 8,
      reuse_bytes: 1,
      outcomes: {
        $: "Driver.OutcomeEnvironment",
        outcome: { $: "Some", value: { $: "Canonical.RequestFinding" } },
        weights: bendList([0, 1078525952, 1078525952, 0, 0, 0].map((high) => ({ $: "Numeric.Words", high, low: 0 })))
      }
    },
    edits: bendList(
      inputs(mode).map((input) => {
        if (
          input.kind !== "edit" ||
          !input.agent ||
          !input.evaluationInputs ||
          input.revisionSubject === undefined ||
          input.revisionInput === undefined
        )
          throw new Error("incomplete original input fixture")
        return {
          $: "sharing_original_inputs.Edit",
          agent: input.agent,
          at: input.at,
          bytes: 10,
          units: bendList([5]),
          subject: input.revisionSubject,
          input: input.revisionInput,
          namespace: {
            $: "sharing_original_inputs.Namespace",
            partition: input.agent,
            work: none,
            credential: none,
            prepared: input.evaluationInputs[0]
          },
          outcome: none
        }
      })
    ),
    jev_delay: mode === 5 ? 5 : 30,
    boundaries: bendList(boundaries)
  }
}

function publicCase(mode: number) {
  const run = originalRun(mode),
    controls: unknown[] = [],
    boundaries: unknown[] = []
  function advance(endpoint: number, budget: number) {
    const result = run.advance({ untilTime: endpoint, maxEvents: budget })
    expect(result.reason).not.toBe("eventLimit")
    const boundary = callbackPublicBoundary(run.observe(), [], [])
    boundaries.push({ endpoint, budget, consumed: result.events, state: boundary.endpoint })
  }
  function control(value: SharingControl) {
    const before = run.projection,
      time = run.observe().now
    const original = validateSharingControl(value)
    run.applyControl(original)
    controls.push({ time, before, after: run.projection, control: original, applied: true })
  }
  advance(2, mode === 6 ? 500 : 600)
  const memberFrames = run.observations.filter(
    (frame) => frame.event.kind === "beginObservedPreparation" && frame.partition === 1
  )
  const capturedMember = memberFrames[1]?.event
  const originalRequests = run.projection.dispatch.requests.map((request) => ({ ...request }))
  if (mode < 6) {
    expect(run.projection.global).toEqual({ items: mode === 3 ? 2 : 1, bytes: mode === 3 ? 10 : 5 })
    expect(originalRequests).toHaveLength(mode === 3 ? 2 : 1)
    if (mode === 1 || mode === 2) {
      const event = memberFrames[mode === 1 ? 1 : 0]?.event
      if (event?.kind !== "beginObservedPreparation") throw new Error("missing original member")
      control({
        kind: "sharingMember",
        action: "leave",
        agent: "a",
        target: {
          partition: event.partition,
          lifetime: event.lifetime,
          round: event.round,
          operation: event.observation
        }
      })
    }
    if (mode === 3 || mode === 4) {
      const agent = run.agentScopes.find((agent) => agent.agent === "a"),
        life = run.observe().adviceeLifecycles.find((life) => life.partition === agent?.partition)
      if (!agent || !life) throw new Error("missing declared original advicee")
      control({
        kind: "sharingMember",
        action: "leaveAll",
        agent: "a",
        partition: agent.partition,
        lifetime: life.lifetime
      })
    }
    advance(3, 200)
    expect(run.projection.dispatch.requests).toEqual(originalRequests)
    expect(run.projection.global).toEqual({ items: mode === 4 ? 0 : 1, bytes: mode === 4 ? 0 : 5 })
  }
  advance(33, mode === 6 ? 800 : 1000)
  const started = run.observations.filter((frame) => frame.event.kind === "jevRequestStarted")
  if (mode < 6) {
    expect(started).toHaveLength(mode === 3 ? 2 : 1)
    expect(run.observations.filter((frame) => frame.event.kind === "submissionTerminal")).toHaveLength(
      mode === 4 ? 0 : 1
    )
    expect(run.projection.dispatch.requests).toEqual([])
    if (mode === 5)
      expect(
        run.observations.some((frame) => frame.commands.some((command) => command.kind === "reuseJoinAdvice"))
      ).toBe(true)
  } else {
    if (capturedMember?.kind !== "beginObservedPreparation")
      throw new Error("missing original superseded joined member")
    expect(
      run.observations.some(
        (frame) =>
          frame.event.kind === "revisionRegister" &&
          frame.commands.some((command) => command.kind === "revisionReplaced")
      )
    ).toBe(true)
    expect(
      run.observations.some(
        (frame) =>
          frame.event.kind === "reuseMemberCheck" &&
          frame.commands.some((command) => command.kind === "reuseKeepMember")
      )
    ).toBe(true)
    expect(
      run.projection.pendingFindings.filter((finding) =>
        run.projection.work.some(
          (work) => work.operation === finding.operation && work.partition === capturedMember.partition
        )
      )
    ).toHaveLength(1)
    expect(started).toHaveLength(2)
  }
  // Ordinary replay reconstructs the original config and ordered controls.
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe())
  const boundary = callbackPublicBoundary(run.observe(), controls, [])
  return { ...boundary, boundaries, eventCount: run.observe().eventCount }
}

// Aggregate allowance: C60s + clang90s + native15s + JS30s + run5s,
// plus15s cleanup. All original cases remain; runner defaults are unchanged.
it("compares all seven original sharing full native/emitted/public/replay boundaries", () => {
  const expectedCases = programs.map((_, mode) => publicCase(mode))
  const fixture = new URL("../../monkey-business-bend/conformance/sharing-native.bend", import.meta.url)
  const nativeReceipt = process.env.HAPSLAND_SHARING_NATIVE_OUTPUT_RECEIPT
  const emittedReceipt = process.env.HAPSLAND_SHARING_JS_OUTPUT_RECEIPT
  const native = nativeReceipt
    ? readRetainedWorkloadOutput(fixture, nativeReceipt, "fresh-native")
    : runWorkloadNative(fixture, { emissionTimeoutMs: 60000, clangTimeoutMs: 90000, executionTimeoutMs: 15000 })
  const emitted = emittedReceipt
    ? readRetainedWorkloadOutput(fixture, emittedReceipt, "emitted-js")
    : runWorkloadEmitted(fixture, { emissionTimeoutMs: 30000 })
  // Complete equality retains every recursively generated owner field, physical
  // order, original CacheFact capsule, graph result and pending payload.
  expect(native).toEqual(emitted)
  if (!Array.isArray(native) || !Array.isArray(emitted))
    throw new TypeError("sharing aggregate must retain the original vector list")
  expect(native).toHaveLength(7)
  expect(emitted).toHaveLength(7)
  for (const [mode, name] of programs.entries()) {
    const expected = expectedCases[mode]
    if (!expected) throw new Error(`missing original sharing case ${name}`)
    const nativeDTO = decodeNativePrefix(native[mode], "sharing_scenarios"),
      emittedDTO = decodeNativePrefix(emitted[mode], "sharing_scenarios")
    expect(nativeDTO, name).toEqual(emittedDTO)
    expect(readRecord(nativeDTO).input, name).toEqual(frozenNativeInput(mode))
    expect(readRecord(emittedDTO).input, name).toEqual(frozenNativeInput(mode))
    const actual = decodeSharingNativeBoundary(nativeDTO)
    expect(actual, name).toEqual(expected)
    expect(decodeSharingNativeBoundary(emittedDTO), name).toEqual(expected)
    // Retain the endpoint oracle from all six original directed native cases.
    if (mode < 6) {
      const projection = expected.endpoint.projection
      expect(actual.endpoint.projection.global, name).toEqual(projection.global)
      expect(actual.endpoint.projection.partitions, name).toEqual(projection.partitions)
      expect(actual.endpoint.projection.dispatch.requests, name).toEqual([])
    }
  }
}, 215000)
