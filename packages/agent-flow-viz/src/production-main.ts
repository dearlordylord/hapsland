import productIcon from "./brand/product-icon.svg?url"
import { preparationDetails } from "./preparation-details"
import { preparationSnapshot } from "./preparation-mini"
import { reviewCapacityView } from "./review-capacity-view"
import {
  SimulationModel,
  initialSimulation,
  actSimulation,
  changeSimulation,
  tickSimulation,
  continueSimulation,
  simulationContinuation,
  runSimulationContinuation,
  simulationView
} from "./fleet-simulation"
import { Effect, Option, Schema } from "effect"
import { Command, type Runtime, type Update } from "foldkit"
import { createLazy, type Document, type HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { IMPORT_GRAPH_SCENARIOS, importGraphView } from "./import-graph-view"
import { TIMELINE_CASES } from "./timeline"
import { timelineView } from "./timeline-view"
import { CAPACITY_INVENTORY } from "./capacity-inventory.generated"
import {
  CANONICAL_SCENARIOS,
  adjacentGuidedPosition,
  completedGuidedActions,
  endingActionGroup,
  guidedActionCount,
  guidedActionLabel,
  historyTimelineLength,
  extendGuidedHistory,
  guidedIndex,
  nextGuidedActionEnd,
  nextGuidedEvent,
  replayCanonical,
  tryAppendCanonical,
  type ReplayEvent
} from "./canonical-replay"
import { productionFlowView } from "./production-flow-view"
import { numberRecords, recordLabel, type RecordNumbers } from "@hapsland/agent-flow-projection"
import { PLACE_ORDER, SQUARES } from "./production-flow-presentation"
import type { CapacityPurpose, CanonicalCommand } from "../../../src/canonical/adapter"

export const Model = Schema.Struct({
  simulation: SimulationModel,
  importScenario: Schema.Number,
  importCursor: Schema.Number,
  timeline: Schema.Number,
  scenario: Schema.Number,
  history: Schema.Array(Schema.Struct({ event: Schema.Unknown, origin: Schema.Literals(["guided", "manual"]) })),
  position: Schema.Number,
  frame: Schema.Number,
  draft: Schema.String,
  feedback: Schema.String,
  flowStage: Schema.String
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  SimulationAction: { action: Schema.String },
  SimulationChanged: { field: Schema.String, raw: Schema.String },
  SimulationTick: { deltaMs: Schema.Number },
  SimulationContinued: { generation: Schema.Number },
  SimulationCameraZoomed: { factor: Schema.Number },
  SimulationCameraRotated: { dx: Schema.Number, dy: Schema.Number },
  SelectedImportScenario: { index: Schema.Number },
  MovedImportCursor: { cursor: Schema.Number },
  SelectedTimeline: { index: Schema.Number },
  SelectedScenario: { index: Schema.Number },
  Advanced: {},
  HistoryForward: {},
  GuidedMoved: { direction: Schema.Number },
  Rewound: {},
  Redid: {},
  Jumped: { position: Schema.Number },
  MovedFrame: { frame: Schema.Number },
  DraftChanged: { raw: Schema.String },
  Submitted: {},
  Reset: {},
  SelectedFlowStage: { stage: Schema.String }
})
export type Message = typeof Message.Type

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    simulation: initialSimulation,
    importScenario: 0,
    importCursor: 0,
    timeline: 0,
    scenario: 0,
    history: [],
    position: 0,
    frame: 0,
    draft: '{"kind":"reserveCapacity","partition":3,"bytes":5,"purpose":"reviewUnit"}',
    feedback: "Replay events use the same checked Bend reducer as the running integration.",
    flowStage: ""
  }
})

const append = (model: Model, event: unknown, origin: ReplayEvent["origin"]): Model => {
  const next = tryAppendCanonical(
    model.history as readonly ReplayEvent[],
    model.position,
    event,
    origin,
    CANONICAL_SCENARIOS[model.scenario].limits
  )
  return {
    ...model,
    history: [...next.history],
    position: next.position,
    frame: 0,
    feedback:
      next.error ??
      (next.rejection === undefined ? "Event accepted by Bend." : `Bend rejected this event: ${next.rejection}.`)
  }
}

const advance = (model: Model): Model => {
  const event = nextGuidedEvent(model.history as readonly ReplayEvent[], model.position, model.scenario)
  return event === undefined ? model : append(model, event, "guided")
}

const advanceGuided = (model: Model, fromFrontier = false): Model => {
  let current = fromFrontier ? { ...model, position: model.history.length } : model
  const prior = guidedIndex(current.history as readonly ReplayEvent[], current.position)
  const target = nextGuidedActionEnd(prior, model.scenario)
  // Preparation frames remain individually inspectable in the guided controls.
  if (
    !fromFrontier &&
    nextGuidedEvent(current.history as readonly ReplayEvent[], current.position, model.scenario)?.kind ===
      "preparationGraph"
  )
    return advance(current)
  while (guidedIndex(current.history as readonly ReplayEvent[], current.position) < target) {
    const next = advance(current)
    if (next.position <= current.position) return next
    current = next
  }
  return current
}

/** Seeking preserves recorded future; only new positions generate checked guided events. */
const seekHistory = (model: Model, requested: number): Model => {
  const horizon = historyTimelineLength(model.history as readonly ReplayEvent[], model.scenario)
  const target = Math.max(0, Math.min(horizon, Number.isFinite(requested) ? Math.trunc(requested) : model.position))
  if (target <= model.history.length) return { ...model, position: target, frame: 0 }
  const next = extendGuidedHistory(model.history as readonly ReplayEvent[], target, model.scenario)
  return {
    ...model,
    history: [...next.history],
    position: next.position,
    frame: 0,
    feedback: next.error
      ? `Cannot reach timeline event ${target}. Stopped at event ${next.position}: ${next.error}`
      : next.rejection
        ? `Bend rejected this event: ${next.rejection}.`
        : "Event accepted by Bend."
  }
}

const ContinueSimulation = Command.define("ContinueSimulation", {
  args: { generation: Schema.Number },
  messages: [Message.SimulationContinued],
  execute: ({ generation }) =>
    Effect.promise(async (signal) => {
      await runSimulationContinuation(generation, signal)
      return Message.SimulationContinued({ generation })
    })
})
const playbackUpdate = (model: Model, simulation: SimulationModel): Update.Return<Model, Message> => {
  const generation = simulationContinuation()
  return {
    model: simulation === model.simulation ? model : { ...model, simulation },
    ...(generation === undefined ? {} : { commands: [ContinueSimulation({ generation })] })
  }
}

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    SimulationAction: ({ action }) => ({ model: { ...model, simulation: actSimulation(model.simulation, action) } }),
    SimulationChanged: ({ field, raw }) => ({
      model: { ...model, simulation: changeSimulation(model.simulation, field, raw) }
    }),
    // Gesture messages carry changes, never stale snapshots of the rest of the camera.
    SimulationCameraZoomed: ({ factor }) => ({
      model: {
        ...model,
        simulation: {
          ...model.simulation,
          cameraEpoch: model.simulation.cameraEpoch + 1,
          zoom: String(Math.round(Math.max(20, Math.min(200, Number(model.simulation.zoom) * factor)) * 10) / 10)
        }
      }
    }),
    SimulationCameraRotated: ({ dx, dy }) => ({
      model: {
        ...model,
        simulation: {
          ...model.simulation,
          cameraEpoch: model.simulation.cameraEpoch + 1,
          turn: String(
            Math.round((((((Number(model.simulation.turn) + dx * 0.35 + 180) % 360) + 360) % 360) - 180) * 10) / 10
          ),
          tilt: String(Math.round(Math.max(0, Math.min(65, Number(model.simulation.tilt) - dy * 0.25)) * 10) / 10)
        }
      }
    }),
    SimulationTick: ({ deltaMs }) => {
      const simulation = tickSimulation(model.simulation, deltaMs)
      return playbackUpdate(model, simulation)
    },
    SimulationContinued: ({ generation }) => playbackUpdate(model, continueSimulation(model.simulation, generation)),
    SelectedImportScenario: ({ index }) => ({
      model: {
        ...model,
        importScenario: index >= 0 && index < IMPORT_GRAPH_SCENARIOS.length ? index : 0,
        importCursor: 0
      }
    }),
    MovedImportCursor: ({ cursor }) => ({
      model: {
        ...model,
        importCursor: Math.max(0, Math.min(IMPORT_GRAPH_SCENARIOS[model.importScenario].steps.length, cursor))
      }
    }),
    SelectedTimeline: ({ index }) => ({
      model: { ...model, timeline: index >= 0 && index < TIMELINE_CASES.length ? index : 0 }
    }),
    SelectedScenario: ({ index }) => ({
      model: {
        ...model,
        scenario: index >= 0 && index < CANONICAL_SCENARIOS.length ? index : 0,
        history: [],
        position: 0,
        frame: 0,
        feedback: "Scenario selected."
      }
    }),
    Advanced: () => ({ model: advanceGuided(model) }),
    HistoryForward: () => ({
      model:
        model.position < model.history.length ? { ...model, position: model.position + 1, frame: 0 } : advance(model)
    }),
    GuidedMoved: ({ direction }) => {
      const position = adjacentGuidedPosition(
        model.history as readonly ReplayEvent[],
        model.position,
        direction < 0 ? -1 : 1,
        model.scenario
      )
      if (position !== undefined) return { model: { ...model, position, frame: 0 } }
      // A new guided step follows all retained manual events instead of branching history.
      return { model: advanceGuided(model, true) }
    },
    Rewound: () => ({ model: { ...model, position: Math.max(0, model.position - 1), frame: 0 } }),
    Redid: () => ({ model: { ...model, position: Math.min(model.history.length, model.position + 1), frame: 0 } }),
    Jumped: ({ position }) => ({ model: seekHistory(model, position) }),
    MovedFrame: ({ frame }) => ({ model: { ...model, frame } }),
    DraftChanged: ({ raw }) => ({ model: { ...model, draft: raw } }),
    Submitted: () => {
      try {
        return { model: append(model, JSON.parse(model.draft), "manual") }
      } catch {
        return { model: { ...model, feedback: "Enter one valid JSON event." } }
      }
    },
    Reset: () => ({ model: { ...model, history: [], position: 0, frame: 0, feedback: "Replay reset." } }),
    SelectedFlowStage: ({ stage }) => ({
      model: {
        ...model,
        flowStage: PLACE_ORDER.includes(stage as (typeof PLACE_ORDER)[number])
          ? stage === model.flowStage
            ? ""
            : stage
          : ""
      }
    })
  })

const purposeLabels: Record<CapacityPurpose, string> = {
  observationDispatch: "Observation and dispatch",
  preparation: "Preparing review",
  reviewUnit: "Review unit",
  storedResult: "Stored result",
  operationalNotice: "Operational notice",
  adviceRecheck: "Advice recheck"
}
const limitLabels = {
  globalItems: "Resident work items",
  globalBytes: "Resident reserved bytes",
  partitionItems: "Agent work items",
  partitionBytes: "Agent reserved bytes"
} as const
const coverageFamilies = [
  {
    name: "Round and observation admission",
    match:
      /^(openRound|admitObservation|startObservation|completeObservation|interruptObservation|issuePermit|consumePermit|releasePermit|expirePermit|closePermitRound)$/,
    source: "packages/agent-flow-bend/Canonical.bend"
  },
  {
    name: "Preparation and ordered unit admission",
    match:
      /^(beginPreparation|beginObservedPreparation|interruptPreparation|preparationCompleted|preparedOfferCheck|emptyPreparedCheck|reserveCapacity|replaceCapacity|resizeCapacity|releaseCapacity)$/,
    source: "packages/agent-flow-bend/Canonical.bend"
  },
  {
    name: "Preparation dispatch queue and cancellation",
    match: /^(queueDispatch|dispatchSettled|discardDispatch|dispatchScopeCheck|closeDispatch)$/,
    source: "packages/agent-flow-bend/Dispatch.bend"
  },
  {
    name: "Jev ready, command, attempt and terminal facts",
    match:
      /^(jevRequestReady|jevRequestStarted|jevRequestInterrupted|jevRequestSettled|startReview|retireReview|reviewCompleted|reviewObserved|reviewFailureCheck|findingCountUpdated)$/,
    source: "packages/agent-flow-bend/Canonical.bend"
  },
  {
    name: "Stop wait, cancellation and finish decision",
    match:
      /^(stopPolled|stopGroupPolled|stopGroupEnded|finishReserve|finishRelease|finishAuthorize|finishTerminal|finishEnd|continuationConsume)$/,
    source: "packages/agent-flow-bend/Canonical.bend"
  },
  {
    name: "Background and Stop collection, leases and expiry",
    match: /^collection/,
    source: "packages/agent-flow-bend/Collection.bend"
  },
  {
    name: "Advice submission, uncertain output and reoffer",
    match: /^submission/,
    source: "packages/agent-flow-bend/Delivery.bend"
  },
  {
    name: "Revision and revalidation",
    match: /^(revision|validationRouteCheck|postValidationCheck|finalCandidateCheck)/,
    source: "packages/agent-flow-bend/Revision.bend"
  },
  {
    name: "Response authority and reuse members",
    match: /^(?:collector|reuseMember)/,
    source: "packages/agent-flow-bend/CollectorAuthority.bend"
  },
  {
    name: "Delivery finalization, round barrier and cleanup",
    match: /^(delivery|round|cleanup)/,
    source: "packages/agent-flow-bend/Delivery.bend"
  },
  {
    name: "Reuse, cache and operational notice",
    match: /^(reuse|cache|notice)/,
    source: "packages/agent-flow-bend/Reuse.bend"
  },
  {
    name: "File and rule policy gates",
    match: /^(includeLayer|fileSelection|fileProtection|candidateFile|reviewAdmission|rule)/,
    source: "packages/agent-flow-bend/RulePolicy.bend"
  }
] as const
const guidedKinds = new Set(CANONICAL_SCENARIOS.flatMap((scenario) => scenario.events.map((event) => event.kind)))
type CapacityFrameCommand = Extract<
  CanonicalCommand,
  {
    readonly kind:
      | "preparationReleased"
      | "unitAdmitted"
      | "unitRefused"
      | "capacityUnitAdmitted"
      | "capacityUnitRefused"
  }
>
const isCapacityFrame = (command: CanonicalCommand): command is CapacityFrameCommand =>
  command.kind === "preparationReleased" ||
  command.kind === "unitAdmitted" ||
  command.kind === "unitRefused" ||
  command.kind === "capacityUnitAdmitted" ||
  command.kind === "capacityUnitRefused"
const frameLabel = (command: CapacityFrameCommand, numbers: RecordNumbers): string => {
  switch (command.kind) {
    case "preparationReleased":
      return `Preparation space released · ${recordLabel("charge:preparation", command.id, numbers)}`
    case "capacityUnitAdmitted":
      return `Unit ${command.position}: accepted · ${command.bytes} B · ${recordLabel("charge:reviewUnit", command.reservation, numbers)}`
    case "capacityUnitRefused":
      return `Unit ${command.position}: no capacity · ${command.bytes} B · ${command.reason}`
    case "unitAdmitted":
      return `Unit ${command.position}: accepted · ${command.bytes} B · ${recordLabel("charge:reviewUnit", command.reservation, numbers)}`
    case "unitRefused":
      return `Unit ${command.position}: no capacity · ${command.bytes} B · ${command.reason}`
  }
}
const commandLabel = (command: CanonicalCommand, numbers: RecordNumbers): string => {
  if (isCapacityFrame(command)) return frameLabel(command, numbers)
  const details = Object.entries(command)
    .filter(([key]) => key !== "kind" && key !== "after")
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
  return [command.kind, ...details].join(" · ")
}

const lazyExamples = createLazy()
const simulationAction = (action: string) => Message.SimulationAction({ action })
const simulationChanged = (field: string, raw: string) => Message.SimulationChanged({ field, raw })
const examplesView = (
  historyInput: Model["history"],
  position: number,
  frameInput: number,
  scenarioInput: number,
  draft: string,
  feedback: string,
  flowStageInput: string,
  importScenario: number,
  importCursor: number,
  timeline: number,
  h: HtmlBuilder<Message>
) => {
  const model = {
    history: historyInput,
    position,
    frame: frameInput,
    scenario: scenarioInput,
    draft,
    feedback,
    flowStage: flowStageInput,
    importScenario,
    importCursor,
    timeline
  }
  const history = model.history as readonly ReplayEvent[]
  const replay = replayCanonical(history, model.position, CANONICAL_SCENARIOS[model.scenario].limits)
  const projection = replay.projection
  const numbers = numberRecords(replay.steps)
  const last = replay.steps.at(-1)
  const frames = last?.commands.filter(isCapacityFrame) ?? []
  const frame = frames[Math.min(Math.max(model.frame, 0), Math.max(0, frames.length - 1))]
  const eventBefore = last?.before.global ?? projection.global
  const eventAfter = last?.after.global ?? projection.global
  const scenario = CANONICAL_SCENARIOS[model.scenario]
  const next = nextGuidedEvent(history, model.position, model.scenario)
  const guided = guidedIndex(history, model.position)
  const group = endingActionGroup(guided, model.scenario)
  const actionSteps = group === undefined ? [] : replay.steps.slice(-(group.last - group.first + 1))
  const completeGroup =
    group !== undefined &&
    actionSteps.length === group.last - group.first + 1 &&
    actionSteps.every(
      (step, index) =>
        step.origin === "guided" &&
        step.rejection === undefined &&
        step.event.kind === scenario.events[group.first - 1 + index]?.kind
    )
  const groupedStep =
    completeGroup && last !== undefined
      ? { ...last, before: actionSteps[0].before, commands: actionSteps.flatMap((step) => step.commands) }
      : last
  const timelineLength = historyTimelineLength(history, model.scenario)
  const flowStage = PLACE_ORDER.find((stage) => stage === model.flowStage)
  return h.div(
    [h.Class("dashboard-examples")],
    [
      h.section(
        [h.Id("canonical-replay"), h.Class("card chart-panel production-flow canonical-replay")],
        [
          h.h2([], ["Guided replay"]),
          h.div(
            [h.Class("canonical-controls")],
            [
              h.details([], [h.summary([], ["Scenario details"]), h.p([], [scenario.description])]),
              h.label(
                [],
                [
                  "Scenario",
                  h.select(
                    [
                      h.AriaLabel("Guided scenario"),
                      h.Value(String(model.scenario)),
                      h.Style({ maxWidth: "100%" }),
                      h.OnChange((raw) => Message.SelectedScenario({ index: Number(raw) }))
                    ],
                    CANONICAL_SCENARIOS.map((item, index) => h.option([h.Value(String(index))], [item.name]))
                  )
                ]
              ),
              h.div(
                [h.Class("canonical-step-controls")],
                [
                  h.button(
                    [h.OnClick(Message.Rewound()), h.Disabled(model.position === 0)],
                    ["Previous history event"]
                  ),
                  h.button(
                    [h.OnClick(Message.Redid()), h.Disabled(model.position === history.length)],
                    ["Redo history event"]
                  ),
                  h.button(
                    [h.OnClick(Message.Advanced()), h.Disabled(next === undefined)],
                    [
                      next === undefined
                        ? "Replay complete"
                        : `Next: ${next.kind === "preparationGraph" ? `preparation · ${next.fact.kind}` : (guidedActionLabel(guided, model.scenario) ?? next.kind)}`
                    ]
                  ),
                  h.button([h.OnClick(Message.Reset())], ["Reset replay"])
                ]
              ),
              h.p(
                [h.Class("canonical-progress")],
                [
                  `Guided step ${guided} of ${scenario.events.length} · action ${completedGuidedActions(guided, model.scenario)}/${guidedActionCount(model.scenario)} · history ${model.position}/${timelineLength} · ${history.length} recorded events`
                ]
              ),
              h.label(
                [h.Class("canonical-scrubber")],
                [
                  "History timeline",
                  h.input([
                    h.Type("range"),
                    h.AriaLabel("Guided replay history"),
                    h.Min("0"),
                    h.Max(String(timelineLength)),
                    h.Step("1"),
                    h.Value(String(model.position)),
                    h.Disabled(timelineLength === 0),
                    h.AriaValuetext(`Event ${model.position} of ${timelineLength}; ${history.length} recorded events`),
                    h.OnInput((raw) => Message.Jumped({ position: Number(raw) })),
                    h.OnKeyDownSelfPreventDefault((key, modifiers) =>
                      modifiers.shiftKey &&
                      !modifiers.altKey &&
                      !modifiers.ctrlKey &&
                      !modifiers.metaKey &&
                      (key === "ArrowLeft" || key === "ArrowRight")
                        ? Option.some(Message.GuidedMoved({ direction: key === "ArrowLeft" ? -1 : 1 }))
                        : Option.none()
                    ),
                    h.Style({ width: "100%" })
                  ])
                ]
              ),
              h.p(
                [h.Class("canonical-shortcuts")],
                ["← / → history (hold to move quickly) · Shift+← / → guided steps · drag the timeline to seek"]
              ),
              h.p([h.Class("canonical-feedback")], [model.feedback]),
              h.details(
                [h.Class("manual-event")],
                [
                  h.summary([], ["Manual event"]),
                  h.form(
                    [h.OnSubmit(Message.Submitted())],
                    [
                      h.label([h.For("canonical-event")], ["Event JSON"]),
                      h.input([
                        h.Id("canonical-event"),
                        h.Type("text"),
                        h.Value(model.draft),
                        h.OnChange((raw) => Message.DraftChanged({ raw }))
                      ]),
                      h.button([h.Type("submit")], ["Apply event"])
                    ]
                  )
                ]
              )
            ]
          ),

          productionFlowView(
            h,
            projection,
            groupedStep,
            model.scenario === 0,
            (stage) => Message.SelectedFlowStage({ stage }),
            preparationSnapshot(replay.steps),
            numbers
          ),
          h.section(
            [h.Class(`flow-stage-inspector${flowStage === "preparation" ? " preparation-selected" : ""}`)],
            [
              h.h3([], ["Square details at this step"]),
              h.label(
                [],
                [
                  "Square",
                  h.select(
                    [
                      h.AriaLabel("Inspect square"),
                      h.Value(flowStage ?? ""),
                      h.OnChange((stage) => Message.SelectedFlowStage({ stage }))
                    ],
                    [
                      h.option([h.Value("")], ["Select a square"]),
                      ...PLACE_ORDER.map((stage) => h.option([h.Value(stage)], [SQUARES[stage].title]))
                    ]
                  )
                ]
              ),
              ...(flowStage === undefined
                ? [h.p([], ["Select a square or click one in the diagram to inspect its records."])]
                : [
                    h.button(
                      [h.Type("button"), h.OnClick(Message.SelectedFlowStage({ stage: "" }))],
                      ["Close square details"]
                    ),
                    h.h4([], [SQUARES[flowStage].title]),
                    ...(flowStage === "preparation"
                      ? [preparationDetails(h, preparationSnapshot(replay.steps), numbers)]
                      : []),
                    ...(SQUARES[flowStage].facets(projection, numbers).length === 0
                      ? [h.p([], ["This square represents a supplied event; it has no retained state records."])]
                      : []),
                    h.ul(
                      [],
                      SQUARES[flowStage].facets(projection, numbers).map((facet) =>
                        h.li(
                          [],
                          [
                            h.strong([], [`${facet.label}: ${facet.count}`]),
                            ...(facet.references.length === 0
                              ? []
                              : [
                                  h.ul(
                                    [],
                                    facet.references.map((reference) => h.li([], [reference.replaceAll("/", " · ")]))
                                  )
                                ])
                          ]
                        )
                      )
                    )
                  ])
            ]
          ),
          h.details(
            [h.Class("flow-coverage")],
            [
              h.summary([], ["Transition-family coverage and source boundaries"]),
              h.p(
                [],
                [
                  "Guided status comes from independent source-free fixtures. Manual replay checks each event against the current Bend state. The source link names each decision family."
                ]
              ),
              h.p(
                [],
                [
                  "Guided sources: ",
                  h.a(
                    [h.Href("https://github.com/dearlordylord/hapsland/blob/master/conformance/canonical-v1.json")],
                    ["replay fixture"]
                  ),
                  " and ",
                  h.a(
                    [
                      h.Href(
                        "https://github.com/dearlordylord/hapsland/blob/master/conformance/canonical-jev-request-v1.json"
                      )
                    ],
                    ["Jev request fixture"]
                  ),
                  "."
                ]
              ),
              h.ul(
                [h.Class("flow-coverage-list")],
                coverageFamilies.map((family) => {
                  const examples = [...guidedKinds].filter((kind) => family.match.test(kind))
                  return h.li(
                    [],
                    [
                      h.strong([], [family.name]),
                      ` · ${examples.length ? `guided: ${examples.join(", ")}` : "manual replay only in this dashboard"}`,
                      " · manual replay available · ",
                      h.a(
                        [h.Href(`https://github.com/dearlordylord/hapsland/blob/master/${family.source}`)],
                        ["Bend source"]
                      )
                    ]
                  )
                })
              ),
              h.p(
                [],
                [
                  "Native facts and effects outside Bend: agent-runtime observation, source capture, clocks, Jev I/O, and host writes. ",
                  h.a(
                    [
                      h.Href(
                        "https://github.com/dearlordylord/hapsland/blob/master/packages/resident-runtime/src/resident/server.ts"
                      )
                    ],
                    ["Resident boundary"]
                  ),
                  ". Production review uses bounded cross-file evidence. The separate import-graph example below replays source-free facts; it does not read files or call Jev."
                ]
              )
            ]
          ),
          h.details(
            [],
            [
              h.summary([], ["Capacity rules"]),
              h.ul(
                [h.Class("capacity-inventory")],
                CAPACITY_INVENTORY.map((entry) =>
                  h.li(
                    [],
                    [
                      h.strong([], [purposeLabels[entry.purpose]]),
                      ` · ${entry.limits.map((limit) => limitLabels[limit]).join(" · ")}`
                    ]
                  )
                )
              )
            ]
          ),
          reviewCapacityView(h, projection),
          ...(frames.length > 0
            ? [
                h.details(
                  [h.Class("capacity-frames")],
                  [
                    h.summary([], ["Capacity transition details"]),
                    h.h3(
                      [],
                      [
                        last?.event.kind === "preparationCompleted"
                          ? "Preparation completion decisions"
                          : "Decisions within this atomic capacity transition"
                      ]
                    ),
                    h.p([], ["These frames explain one atomic Bend transition; they are not extra resident states."]),
                    h.p([], [`Before event · ${eventBefore.items} shared items · ${eventBefore.bytes} shared bytes`]),
                    h.div(
                      [],
                      frames.map((command, index) =>
                        h.button(
                          [
                            h.OnClick(Message.MovedFrame({ frame: index })),
                            h.Class(index === model.frame ? "selected" : "")
                          ],
                          [commandLabel(command, numbers)]
                        )
                      )
                    ),
                    h.p(
                      [],
                      [
                        `Frame ${Math.min(model.frame + 1, frames.length)} of ${frames.length} · ${frame.after.global.items} shared items · ${frame.after.global.bytes} shared bytes · ${frame.after.local.items} items and ${frame.after.local.bytes} bytes for this agent`
                      ]
                    ),
                    h.p([], [`After event · ${eventAfter.items} shared items · ${eventAfter.bytes} shared bytes`]),
                    h.div(
                      [
                        h.Class("capacity-bar"),
                        h.Role("img"),
                        h.AriaLabel(
                          `${frame.after.global.bytes} of ${projection.limits.globalBytes} reserved review bytes within transition`
                        )
                      ],
                      frame.after.charges.map((charge) =>
                        h.span(
                          [
                            h.Class(`capacity-segment agent-${charge.partition}`),
                            h.Style({ width: `${(charge.bytes / projection.limits.globalBytes) * 100}%` })
                          ],
                          [`Agent ${charge.partition}`]
                        )
                      )
                    )
                  ]
                )
              ]
            : []),
          h.details(
            [h.Class("replay-history")],
            [
              h.summary([], ["Replay history"]),
              h.div(
                [h.Class("history")],
                [
                  h.button([h.OnClick(Message.Jumped({ position: 0 }))], ["Start"]),
                  ...history.map((entry, index) =>
                    h.button(
                      [
                        h.OnClick(Message.Jumped({ position: index + 1 })),
                        h.Class(index + 1 === model.position ? "selected" : "")
                      ],
                      [
                        `${index + 1}. ${entry.event.kind === "preparationGraph" ? `preparation · ${entry.event.fact.kind}` : entry.event.kind} · ${entry.origin}`
                      ]
                    )
                  )
                ]
              )
            ]
          )
        ]
      ),
      importGraphView(
        h,
        model.importScenario,
        model.importCursor,
        (index) => Message.SelectedImportScenario({ index }),
        (cursor) => Message.MovedImportCursor({ cursor })
      ),
      timelineView(h, model.timeline, (index) => Message.SelectedTimeline({ index }))
    ]
  )
}

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  return {
    title: "Hapsland · guided replay",
    body: h.main(
      [h.Class("page")],
      [
        h.header(
          [h.Class("page-header")],
          [
            h.p(
              [h.Class("eyebrow product-brand")],
              [h.img([h.Src(productIcon), h.Alt(""), h.Width("40"), h.Height("40")]), "HAPSLAND"]
            ),
            h.h1([], ["From agent edit to Jev and back"]),
            h.p([h.Class("intro")], ["Run the simulator or step through a guided replay."])
          ]
        ),
        simulationView(model.simulation, h, simulationAction, simulationChanged),
        lazyExamples(examplesView, [
          model.history,
          model.position,
          model.frame,
          model.scenario,
          model.draft,
          model.feedback,
          model.flowStage,
          model.importScenario,
          model.importCursor,
          model.timeline,
          h
        ])
      ]
    )
  }
}
