import { strict as assert } from "node:assert"
import {
  createRun,
  restoreReplay,
  DEFAULT_FILE_TREE_PROFILE,
  type RunConfig,
  type RunStructuralFrame
} from "./index.ts"

// Frozen caller inputs match the original delay8 directed case. They contain
// no allocated scope, operation, request, callback or output capture.
export const originalWaitingStopConfig = {
  seed: 7,
  retention: 1000,
  preparationDelay: 2,
  jevDelay: 8,
  finishDeadline: 8,
  outcome: "clear",
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
  inputs: [
    { at: 0, kind: "edit", bytes: 10, unitBytes: [5] },
    { at: 3, kind: "finish" }
  ] as const
} satisfies RunConfig
export const originalWaitingStopBoundaries = [3, 10, 20] as const

/** Actual source points, including physical delivery and registration. Replay
 * uses the ordinary exported configuration, not a recorded native event feed. */
export function originalWaitingStopPublic() {
  const run = createRun(originalWaitingStopConfig)
  const frames: RunStructuralFrame[] = []
  const unsubscribe = run.subscribeStructural((frame) => frames.push(frame))
  const boundaries = originalWaitingStopBoundaries.map((endpoint) => {
    const result = run.advance({ untilTime: endpoint, maxEvents: 100 })
    if (result.reason === "eventLimit") throw new Error("original Stop boundary exhausted its budget")
    const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
    assert.deepEqual(restored.observe(), run.observe(), "ordinary Stop replay boundary")
    assert.deepEqual(restored.runtimeSnapshot(), run.runtimeSnapshot(), "ordinary replay full source state and queue")
    if (endpoint === 3) {
      const started = run.observations.find((frame) => frame.event.kind === "jevRequestStarted")
      assert.equal(started?.time, 2, "original physical request starts after preparation")
      const waiting = run.observations.find((frame) => frame.event.kind === "stopPolled")
      assert.equal(waiting?.time, 3, "original Stop starts at the caller boundary")
      assert.equal(
        waiting?.outputs.some((command) => command.kind === "waitForWork"),
        true
      )
      assert.equal(
        run.observations.some((frame) => frame.event.kind === "finishReserve"),
        false
      )
    } else if (endpoint === 10) {
      const ready = run.observations.find((frame) => frame.outputs.some((command) => command.kind === "finishReady"))
      assert.equal(ready?.time, 10, "real settlement wakes Stop before original cutoff11")
      assert.equal(
        run.observations.some((frame) => frame.event.kind === "finishAuthorize"),
        false
      )
      assert.equal(
        run.observations.some((frame) => frame.event.kind === "stopGroupEnded" && frame.time === 10),
        true
      )
    } else {
      assert.deepEqual(run.projection.dispatch.requests, [], "original request physically settles")
      assert.deepEqual(run.projection.global, { items: 0, bytes: 0 }, "original work charge is released")
    }
    return {
      endpoint,
      budget: 100,
      consumed: result.events,
      runtime: run.runtimeSnapshot(),
      observation: run.observe(),
      restored: restored.observe()
    }
  })
  unsubscribe()
  return {
    input: originalWaitingStopConfig,
    agentScopes: run.agentScopes,
    frames,
    boundaries,
    endpoint: run.runtimeSnapshot(),
    observation: run.observe()
  }
}

const dormantStopSession = { editIntervalMs: 1000000, variationMs: 0, editsPerTask: 1000 }
type OriginalStopBoundary =
  | { readonly endpoint: number; readonly budget: number }
  | { readonly input: NonNullable<RunConfig["inputs"]>[number] }
  | {
      readonly outputProfile: {
        readonly outcome: "certain" | "uncertain" | "failed"
        readonly delayMs: number
        readonly leaseMs: number
      }
    }
  | { readonly mismatchedTerminal: { readonly at: number; readonly agent?: string } }
const advances = (endpoints: readonly number[], budget = 100): readonly OriginalStopBoundary[] =>
  endpoints.map((endpoint) => ({ endpoint, budget }))
const waitingInputs = originalWaitingStopConfig.inputs
// Independent original caller declarations. No allocated runtime identities are
// derived from a native endpoint or used to prepare these configurations.
export const originalStopCases: readonly {
  readonly name: string
  readonly config: RunConfig
  readonly boundaries: readonly OriginalStopBoundary[]
}[] = [
  { name: "waiting8", config: originalWaitingStopConfig, boundaries: advances([3, 10, 20]) },
  { name: "waiting9", config: { ...originalWaitingStopConfig, jevDelay: 9 }, boundaries: advances([3, 11, 20]) },
  { name: "waiting10", config: { ...originalWaitingStopConfig, jevDelay: 10 }, boundaries: advances([3, 11, 20]) },
  {
    name: "latePreparation",
    config: {
      ...originalWaitingStopConfig,
      jevDelay: 1,
      preparationDelay: 12,
      finishDeadline: 2,
      inputs: [waitingInputs[0], { at: 1, kind: "finish" }]
    },
    boundaries: advances([1, 3, 20])
  },
  {
    name: "noRound",
    config: {
      ...originalWaitingStopConfig,
      inputs: [
        { at: 0, kind: "finish" },
        { at: 1, kind: "finish" }
      ]
    },
    boundaries: advances([0, 1], 1)
  },
  {
    name: "repeatedFinish",
    config: { ...originalWaitingStopConfig, inputs: [...waitingInputs, { at: 3, kind: "finish" }] },
    boundaries: advances([3, 10, 20])
  },
  ...(["certain", "uncertain"] as const).map((outcome) => ({
    name: `background${outcome}`,
    config: {
      ...originalWaitingStopConfig,
      jevDelay: 5,
      outcome: "finding" as const,
      finishDeadline: 10,
      session: dormantStopSession,
      outputProfile: { outcome, delayMs: 9, leaseMs: 20 },
      inputs: [waitingInputs[0], { at: 8, kind: "finish" as const }]
    },
    boundaries: advances([7, 8, 16, 40])
  })),
  {
    name: "configuredNoRound",
    config: {
      ...originalWaitingStopConfig,
      session: dormantStopSession,
      inputs: [{ at: 0, kind: "finish", recurring: true }]
    },
    boundaries: advances([0, 1], 1)
  },
  {
    name: "groupOutput",
    config: {
      seed: 7,
      retention: 1000,
      preparationDelay: 2,
      jevDelay: 5,
      finishDeadline: 200,
      session: dormantStopSession,
      fileTrees: originalWaitingStopConfig.fileTrees,
      outputProfile: { outcome: "certain", delayMs: 9, leaseMs: 20 },
      inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5], outcome: "finding" }]
    },
    boundaries: [
      { endpoint: 7, budget: 100 },
      {
        input: {
          at: 8,
          kind: "canonical",
          event: {
            kind: "stopGroupPolled",
            group: 1,
            lifetime: 1,
            round: 1,
            scopes: [{ partition: 1, round: 1 }],
            deadline: false,
            extraPending: false,
            continuations: 0
          }
        }
      },
      { endpoint: 8, budget: 100 },
      {
        input: {
          at: 9,
          kind: "canonical",
          event: {
            kind: "stopGroupPolled",
            group: 1,
            lifetime: 1,
            round: 1,
            scopes: [{ partition: 1, round: 1 }],
            deadline: true,
            extraPending: false,
            continuations: 0
          }
        }
      },
      { endpoint: 9, budget: 100 },
      { endpoint: 20, budget: 100 }
    ]
  },
  {
    name: "otherAdviceeOutput",
    config: {
      seed: 7,
      retention: 1000,
      preparationDelay: 2,
      jevDelay: 5,
      finishDeadline: 10,
      sessions: [
        { ...dormantStopSession, agent: "a" },
        { ...dormantStopSession, agent: "b" }
      ],
      fileTrees: originalWaitingStopConfig.fileTrees,
      outputProfile: { outcome: "certain", delayMs: 9, leaseMs: 20 },
      inputs: [
        { at: 0, kind: "edit", agent: "a", bytes: 10, unitBytes: [5], outcome: "clear" },
        { at: 0, kind: "edit", agent: "b", bytes: 10, unitBytes: [5], outcome: "finding" },
        { at: 8, kind: "finish", agent: "a" }
      ]
    },
    boundaries: advances([7, 8, 20], 200)
  }
]

function collectOriginalStopCases(cases: typeof originalStopCases) {
  return cases.map((original) => {
    const run = createRun(original.config),
      frames: RunStructuralFrame[] = []
    const unsubscribe = run.subscribeStructural((frame) => frames.push(frame))
    const boundaries = original.boundaries.map((input) => {
      let consumed = 0
      let actualInput: OriginalStopBoundary = input
      const before = run.runtimeSnapshot()
      if ("outputProfile" in input) run.applyControl({ kind: "outputProfile", ...input.outputProfile })
      else if ("mismatchedTerminal" in input) {
        const issued = run.observations.findLast((frame) => frame.event.kind === "finishAuthorize")
        if (!issued || issued.event.kind !== "finishAuthorize")
          throw new Error("missing genuine issued Finish identity")
        const { group, round, attempt, token } = issued.event
        const scheduled = {
          at: input.mismatchedTerminal.at,
          kind: "canonical" as const,
          event: {
            kind: "finishTerminal" as const,
            group,
            round,
            attempt,
            token,
            selected: [],
            outcome: "unknown" as const
          }
        }
        run.schedule(scheduled)
        actualInput = { input: scheduled }
      } else if ("input" in input) run.schedule(input.input)
      else {
        const result = run.advance({ untilTime: input.endpoint, maxEvents: input.budget })
        if (result.reason === "eventLimit") throw new Error(`${original.name} exhausted original boundary budget`)
        consumed = result.events
      }
      const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
      assert.deepEqual(restored.observe(), run.observe(), `${original.name} ordinary boundary replay`)
      assert.deepEqual(restored.runtimeSnapshot(), run.runtimeSnapshot(), `${original.name} complete boundary replay`)
      return { input: actualInput, consumed, before, runtime: run.runtimeSnapshot() }
    })
    unsubscribe()
    return {
      name: original.name,
      input: original.config,
      agentScopes: run.agentScopes,
      frames,
      boundaries,
      endpoint: run.runtimeSnapshot(),
      observation: run.observe()
    }
  })
}

export function originalStopPublicCases() {
  return collectOriginalStopCases(originalStopCases)
}

const outputInputs = [
  { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] },
  { at: 1, kind: "finish" as const }
]
const outputConfiguration = (
  bytes: number,
  outcome: "certain" | "uncertain" | "failed",
  seed = 7,
  preparation = 2,
  backend = 5,
  retention = 1000,
  delay = 5,
  lease = 20
): RunConfig => ({
  seed,
  retention,
  outcome: "finding",
  preparationDelay: preparation,
  jevDelay: backend,
  finishDeadline: 50,
  lifecycles: { encodedOutputBytes: bytes },
  outputProfile: { outcome, delayMs: delay, leaseMs: lease },
  inputs: outputInputs
})
// These caller literals preserve the original stop-budget-boundaries and
// seeded-stop-budget-campaigns inputs; native traces supply no configuration.
export const originalStopOutputCases: typeof originalStopCases = [
  ...[10239, 10240, 10241].map((bytes) => ({
    name: `bytes${bytes}`,
    config: outputConfiguration(bytes, "uncertain"),
    boundaries: advances([7, 20], 300)
  })),
  { name: "provisionalRelease", config: outputConfiguration(10240, "failed"), boundaries: advances([7, 12], 300) },
  {
    name: "mismatchedMembers",
    config: outputConfiguration(10240, "uncertain"),
    boundaries: [
      { endpoint: 7, budget: 300 },
      { mismatchedTerminal: { at: 8 } },
      { endpoint: 8, budget: 300 },
      { endpoint: 12, budget: 300 }
    ]
  },
  ...[
    { seed: 7, preparation: 2, backend: 5, outcome: "uncertain" as const, delay: 5, lease: 30 },
    { seed: 91001, preparation: 3, backend: 7, outcome: "failed" as const, delay: 6, lease: 30 },
    { seed: 4294967313, preparation: 1, backend: 9, outcome: "uncertain" as const, delay: 4, lease: 30 },
    { seed: 11, preparation: 2, backend: 5, outcome: "certain" as const, delay: 4, lease: 5 },
    { seed: 12, preparation: 2, backend: 5, outcome: "certain" as const, delay: 5, lease: 5 },
    { seed: 13, preparation: 2, backend: 5, outcome: "certain" as const, delay: 6, lease: 5 }
  ].map((c) => {
    const ready = c.preparation + c.backend,
      terminal = ready + (c.outcome === "failed" ? c.delay : Math.min(c.delay, c.lease))
    return {
      name: `campaign${c.seed}`,
      config: outputConfiguration(10240, c.outcome, c.seed, c.preparation, c.backend, 10000, c.delay, c.lease),
      boundaries: [
        { endpoint: ready, budget: 500 },
        { outputProfile: { outcome: "certain" as const, delayMs: 1, leaseMs: 1 } },
        { endpoint: terminal - 1, budget: 500 },
        { endpoint: terminal, budget: 500 }
      ]
    }
  }),
  {
    name: "continuationBudget",
    config: {
      ...outputConfiguration(10240, "uncertain", 91001, 2, 5, 10000, 5, 30),
      inputs: Array.from({ length: 5 }, (_, i) => [
        { at: i * 40, kind: "edit" as const, bytes: 10, unitBytes: [5] },
        { at: i * 40 + 1, kind: "finish" as const }
      ]).flat()
    },
    boundaries: advances([7, 12, 47, 52, 87, 92, 127, 132, 161, 167, 172], 500)
  }
]
export function originalStopOutputPublicCases() {
  return collectOriginalStopCases(originalStopOutputCases)
}
