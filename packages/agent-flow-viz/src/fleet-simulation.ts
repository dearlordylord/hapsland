import { Schema } from "effect"
import { createKeyedLazy, createLazy, type HtmlBuilder } from "foldkit/html"
import { numberRecords } from "@hapsland/agent-flow-projection"
import { preparationSnapshot } from "./preparation-mini"
import { productionFlowView, INFRASTRUCTURE_CONTACTS } from "./production-flow-view"
import { projectAgent } from "../../monkey-business/src/index"
import { sharedResidentView, AGENT_COLORS } from "./shared-resident-view"
import {
  SimulationModel as ResidentModel,
  initialSimulation as initialResident,
  actSimulation as actResident,
  changeSimulation as changeResident,
  tickSimulation as tickResident,
  simulationView as residentView,
  simulationRun,
  selectSimulationAgent
} from "./simulation"

export const SimulationModel = Schema.Struct({
  resident: ResidentModel,
  count: Schema.String,
  active: Schema.Number,
  tilt: Schema.String,
  turn: Schema.String,
  spacing: Schema.String,
  zoom: Schema.String,
  cameraEpoch: Schema.Number,
  flat: Schema.Boolean,
  playing: Schema.Boolean,
  feedback: Schema.String
})
export type SimulationModel = typeof SimulationModel.Type
export const initialSimulation: SimulationModel = {
  resident: initialResident,
  count: "1",
  active: 0,
  tilt: "48",
  turn: "-16",
  spacing: "130",
  zoom: "72",
  cameraEpoch: 0,
  flat: false,
  playing: false,
  feedback: "Choose the number of advicees, then start one shared resident."
}
const displayScopes = (model: ResidentModel) => {
  const run = simulationRun()
  if (run?.agentScopes.length) return run.agentScopes
  const partitions = run?.projection.partitions.map((record) => record.partition).sort((a, b) => a - b) ?? []
  return (partitions.length ? partitions : [1]).map((partition) => ({
    agent: `agent-${partition}`,
    partition,
    seed: run?.exportReplay().config.seed ?? Number(model.seed)
  }))
}
const reconcile = (model: SimulationModel, resident: ResidentModel): SimulationModel => ({
  ...model,
  resident,
  playing: resident.playing,
  feedback: resident.feedback
})
export const changeSimulation = (model: SimulationModel, field: string, raw: string): SimulationModel => {
  if (["count", "tilt", "turn", "spacing", "zoom"].includes(field))
    return {
      ...model,
      [field]: raw,
      feedback:
        field === "count"
          ? "Advicee count is a draft. Start resident resets the resident with this many independent generators."
          : model.feedback
    }
  return reconcile(model, changeResident(model.resident, field, raw))
}
export const actSimulation = (model: SimulationModel, action: string): SimulationModel => {
  if (action === "fleet:start" || action === "start") {
    const count = Number(model.count)
    if (!Number.isSafeInteger(count) || count < 1 || count > 6)
      return { ...model, feedback: "Advicee count must be an integer from 1 to 6. The resident is unchanged." }
    const resident = actResident({ ...model.resident, agentCount: model.count, agentId: "agent-1" }, "start")
    return { ...reconcile(model, resident), active: 0, feedback: resident.feedback }
  }
  if (action.startsWith("fleet:select:")) {
    const index = Number(action.slice(13))
    const scope = displayScopes(model.resident)[index]
    return scope ? reconcile({ ...model, active: index }, selectSimulationAgent(model.resident, scope.agent)) : model
  }
  if (action === "fleet:flat") return { ...model, flat: !model.flat }
  if (action === "fleet:camera")
    return {
      ...model,
      cameraEpoch: model.cameraEpoch + 1,
      tilt: "48",
      turn: "-16",
      spacing: "130",
      zoom: "72",
      flat: false
    }
  if (action === "fleet:play" || action === "fleet:step") {
    const ready = simulationRun() ? model : actSimulation(model, "fleet:start")
    return reconcile(ready, actResident(ready.resident, action === "fleet:step" ? "step" : "play"))
  }
  if (action.startsWith("fleet:inspect:")) {
    const [, , raw, stage] = action.split(":")
    const selected = actSimulation(model, `fleet:select:${raw}`)
    return reconcile({ ...selected, flat: true }, actResident(selected.resident, `focus:${stage}`))
  }
  const result = actResident(model.resident, action)
  const resident =
    action === "load" && result.feedback.startsWith("Replay reconstructed")
      ? selectSimulationAgent(result, displayScopes(result)[0].agent)
      : result
  return {
    ...reconcile(model, resident),
    ...(action === "load" && resident.feedback.startsWith("Replay reconstructed")
      ? { active: 0, count: resident.agentCount }
      : {})
  }
}
export const tickSimulation = (model: SimulationModel, deltaMs: number): SimulationModel =>
  reconcile(model, tickResident(model.resident, deltaMs))

const colors = AGENT_COLORS
const bounded = (raw: string, low: number, high: number, fallback: number) =>
  Number.isFinite(Number(raw)) ? Math.max(low, Math.min(high, Number(raw))) : fallback
// Checked snapshots are immutable; graph frames often share the same snapshot.
// Weak keys release lenses together with retired display history.
const agentProjections = new WeakMap<Parameters<typeof projectAgent>[0], Map<number, ReturnType<typeof projectAgent>>>()
const agentProjection = (snapshot: Parameters<typeof projectAgent>[0], partition: number) => {
  let partitions = agentProjections.get(snapshot)
  if (!partitions) {
    partitions = new Map()
    agentProjections.set(snapshot, partitions)
  }
  const cached = partitions.get(partition)
  if (cached) return cached
  const local = projectAgent(snapshot, partition)
  partitions.set(partition, local)
  return local
}

// Only display data is cached. Run identity/count also invalidate the cache when
// a replay is replaced or advanced independently of a renderer update.
const buildScene = (resident: ResidentModel) => {
  const model = { resident }
  const run = simulationRun()
  const observations = run?.observations ?? []
  const current =
    model.resident.selected < 0
      ? observations.at(-1)
      : observations.find((frame) => frame.sequence === model.resident.selected)
  const eventOwner = current?.partition
  const history = observations.filter((frame) => frame.sequence <= (current?.sequence ?? -1))
  const projection = model.resident.selected < 0 ? (current?.after ?? run?.projection) : current?.after
  const numbers = numberRecords(observations[0]?.sequence === 0 ? history : [])
  const scopes = displayScopes(model.resident)
  const preparation = preparationSnapshot(history.map((frame) => ({ ...frame, origin: "manual" as const })))
  const layers = scopes.map((agent, index) => {
    const local = projection ? agentProjection(projection, agent.partition) : undefined
    const ownedHistory = history.filter((frame) => frame.partition === agent.partition)
    const last =
      current?.partition === agent.partition
        ? {
            ...current,
            before: agentProjection(current.before, agent.partition),
            after: agentProjection(current.after, agent.partition),
            origin: "manual" as const
          }
        : undefined
    const activity =
      model.resident.selected < 0 && model.resident.activityFrom >= 0
        ? ownedHistory
            .filter((frame) => frame.sequence >= model.resident.activityFrom)
            .map((frame) => ({
              ...frame,
              before: agentProjection(frame.before, agent.partition),
              after: agentProjection(frame.after, agent.partition),
              origin: "manual" as const
            }))
        : undefined
    return {
      agent,
      index,
      local,
      activity,
      preparation,
      current: ownedHistory.at(-1),
      history: ownedHistory,
      numbers,
      last
    }
  })
  return {
    run,
    current,
    history,
    projection,
    numbers,
    scopes,
    layers,
    eventOwner,
    metadata: current ? current.capacityMetadata : resident.selected < 0 ? run?.capacityMetadata : undefined
  }
}
let sceneCache:
  | {
      resident: ResidentModel
      run: ReturnType<typeof simulationRun>
      count: number
      value: ReturnType<typeof buildScene>
    }
  | undefined
const sceneFor = (resident: ResidentModel) => {
  const run = simulationRun()
  const count = run?.eventCount ?? 0
  if (sceneCache?.resident === resident && sceneCache.run === run && sceneCache.count === count) return sceneCache.value
  const value = buildScene(resident)
  sceneCache = { resident, run, count, value }
  return value
}
const lazyDiagrams = createKeyedLazy()
const lazyInspector = createLazy()
type Scene = ReturnType<typeof buildScene>
type Layer = Scene["layers"][number]
const layerDiagram = <Message>(
  h: HtmlBuilder<Message>,
  layer: Layer,
  scene: Scene,
  group: string,
  round: string,
  action: (action: string) => Message
) =>
  layer.local
    ? productionFlowView(
        h,
        layer.local,
        layer.last,
        false,
        (place) => action(`fleet:inspect:${layer.index}:${place}`),
        layer.preparation,
        layer.numbers,
        true,
        scene.projection,
        scene.metadata,
        layer.agent.partition,
        { group: group === "" ? undefined : Number(group), round: round === "" ? undefined : Number(round) },
        scene.scopes,
        layer.activity
      )
    : null
const inspectorView = <Message>(
  resident: ResidentModel,
  h: HtmlBuilder<Message>,
  action: (action: string) => Message,
  changed: (field: string, raw: string) => Message,
  layer: Layer,
  scopes: Scene["scopes"]
) =>
  residentView(
    resident,
    h,
    action,
    changed,
    false,
    layer.local
      ? { projection: layer.local, observations: layer.history, partition: layer.agent.partition, agents: scopes }
      : undefined
  )

export const simulationView = <Message>(
  model: SimulationModel,
  h: HtmlBuilder<Message>,
  action: (action: string) => Message,
  changed: (field: string, raw: string) => Message
) => {
  const button = (label: string, name: string, selected = false) =>
    h.button([h.Type("button"), h.Class(selected ? "selected" : ""), h.OnClick(action(name))], [label])
  // Pointer/key edits own the native thumb; gesture/reset epochs synchronize external changes.
  const range = (name: string, field: string, min: number, max: number, value: string) =>
    h.label(
      [],
      [
        name,
        h.input([
          h.Type("range"),
          h.AriaLabel(name),
          h.Min(String(min)),
          h.Max(String(max)),
          h.Key(`camera:${field}:${model.cameraEpoch}`),
          { _tag: "Prop", key: "defaultValue", value },
          h.OnInput((raw) => changed(field, raw))
        ])
      ]
    )
  const scene = sceneFor(model.resident)
  const { run, current, projection, scopes, layers, eventOwner } = scene
  const spacing = bounded(model.spacing, 70, 190, 130)
  const sceneHeight = model.flat ? 660 : 630 + Math.max(0, layers.length - 3) * 75
  const active = layers[Math.min(model.active, layers.length - 1)]
  return h.div(
    [h.Id("monkey-business"), h.Class("ensemble")],
    [
      h.section(
        [h.Id("agent-ensemble"), h.Class(`ensemble-panel ${model.flat ? "is-flat" : "is-spatial"}`)],
        [
          h.div(
            [h.Class("ensemble-heading")],
            [
              h.div(
                [],
                [
                  h.p([h.Class("eyebrow")], ["MONKEY BUSINESS / SHARED RESIDENT"]),
                  h.h2([], ["One resident. Opaque advicees."]),
                  h.p(
                    [],
                    [
                      "Each advicee generates its own events. All layers share one capacity ledger, one Jev pool and one timeline."
                    ]
                  )
                ]
              )
            ]
          ),
          h.div(
            [h.Class("ensemble-toolbar")],
            [
              h.form(
                [h.OnSubmit(action("fleet:start")), h.Class("ensemble-start")],
                [
                  h.label(
                    [],
                    [
                      "Advicees",
                      h.input([
                        h.Type("number"),
                        h.AriaLabel("Advicee count"),
                        h.Min("1"),
                        h.Max("6"),
                        h.Step("1"),
                        h.Key(`agent-count:${model.resident.draftEpoch}`),
                        h.Attribute("value", model.count),
                        h.OnInput((raw) => changed("count", raw))
                      ])
                    ]
                  ),
                  h.button([h.Type("submit"), h.Class("ensemble-primary")], ["Start resident"])
                ]
              ),
              button(model.playing ? "Pause resident" : "Play resident", "fleet:play"),
              button("Step resident", "fleet:step"),
              h.span([h.Class("ensemble-toolbar-divider")], []),
              button(model.flat ? "3D layers" : "Focus selected advicee", "fleet:flat", model.flat),
              button("Reset view", "fleet:camera")
            ]
          ),
          h.p(
            [h.Class("ensemble-feedback"), h.Role("status")],
            [
              model.resident.selected >= 0 && !current
                ? "Selected event is unavailable in retained history. Return to latest to inspect the resident."
                : model.feedback
            ]
          ),
          ...(projection
            ? [
                sharedResidentView(
                  h,
                  scopes,
                  current?.sequence ?? -1,
                  current?.time ?? run?.now ?? 0,
                  projection,
                  run?.exportReplay().config.limits !== undefined
                )
              ]
            : []),
          h.div(
            [h.Class("ensemble-layout")],
            [
              h.aside(
                [h.Class("ensemble-agents"), h.AriaLabel("Advicee layers")],
                [
                  h.p([h.Class("ensemble-sidebar-label")], ["ADVICEE LAYERS"]),
                  h.p([h.Class("ensemble-hover-hint")], ["Hover to reveal a layer. Click to select."]),
                  h.p([h.Class("ensemble-hover-hint")], ["The same resident pools are shown on every layer."]),
                  ...layers.map(({ agent, index, current, history }) =>
                    h.button(
                      [
                        h.Type("button"),
                        h.Class(`ensemble-agent agent-index-${index} ${index === model.active ? "selected" : ""}`),
                        h.Style({ borderLeftColor: colors[index] }),
                        h.OnClick(action(`fleet:select:${index}`)),
                        h.AriaLabel(`Select advicee ${index + 1}`)
                      ],
                      [
                        h.strong(
                          [],
                          [
                            `Advicee ${String(index + 1).padStart(2, "0")}`,
                            h.span(
                              [
                                h.Class("ensemble-event-marker"),
                                ...(eventOwner === agent.partition
                                  ? [
                                      h.Role("img"),
                                      h.AriaLabel("Current event"),
                                      h.Title("Current event"),
                                      h.Style({ background: colors[index] })
                                    ]
                                  : [h.AriaHidden(true)])
                              ],
                              []
                            )
                          ]
                        ),
                        h.span([], [run && !run.agentScopes.length ? "Scripted events" : `Seed ${agent.seed}`]),
                        h.span([], [`${model.playing ? "Running" : "Paused"} · ${history.length} retained events`]),
                        h.small([], [current?.event.kind ?? "Ready to start"])
                      ]
                    )
                  ),
                  h.p(
                    [h.Class("ensemble-scope")],
                    [
                      "Select an advicee for its generator controls and stage inspection. Playback, history and replay belong to the whole resident."
                    ]
                  )
                ]
              ),
              h.div(
                [
                  h.Class("ensemble-viewport"),
                  h.Style({ height: model.flat ? "auto" : `${sceneHeight}px` }),
                  h.AriaLabel("Three-dimensional advicee diagram")
                ],
                [
                  h.div(
                    [
                      h.Class("ensemble-scene"),
                      h.Style({
                        transform: model.flat
                          ? "none"
                          : `translateY(${-35 + Math.max(0, layers.length - 3) * 30}px) scale(${bounded(model.zoom, 20, 200, 72) / 100}) rotateX(${bounded(model.tilt, 0, 65, 48)}deg) rotateZ(${bounded(model.turn, -180, 180, -16)}deg) translateZ(${(-(layers.length - 1) * spacing) / 2}px)`
                      })
                    ],
                    [
                      ...layers
                        .filter((layer) => !model.flat || layer.index === model.active)
                        .map(({ agent, index, local }) =>
                          h.div(
                            [
                              h.Class(
                                `ensemble-layer agent-index-${index} ${index === model.active ? "is-selected" : ""}`
                              ),
                              h.Style({
                                transform: model.flat
                                  ? "none"
                                  : `translateZ(${(layers.length - 1 - index) * spacing}px)`,
                                borderColor: colors[index]
                              })
                            ],
                            [
                              h.div(
                                [h.Class("ensemble-layer-title"), h.Style({ color: colors[index] })],
                                [
                                  h.strong([], [`ADVICEE ${String(index + 1).padStart(2, "0")}`]),
                                  h.span([], [`${current?.time ?? run?.now ?? 0} ms · seed ${agent.seed}`])
                                ]
                              ),
                              ...(local
                                ? [
                                    lazyDiagrams(index, layerDiagram, [
                                      h,
                                      layers[index],
                                      scene,
                                      index === model.active ? model.resident.resourceGroup : "",
                                      index === model.active ? model.resident.resourceRound : "",
                                      action
                                    ])
                                  ]
                                : [
                                    h.div(
                                      [h.Class("ensemble-empty")],
                                      [
                                        h.strong([], ["Your advicee diagram starts here"]),
                                        h.p(
                                          [],
                                          ["Start one resident to connect independent Monkey Business generators."]
                                        )
                                      ]
                                    )
                                  ])
                            ]
                          )
                        ),
                      ...(!model.flat
                        ? layers
                            .slice(0, -1)
                            .filter((layer) => layer.local)
                            .flatMap(({ index }) =>
                              INFRASTRUCTURE_CONTACTS.map((contact) =>
                                h.div(
                                  [
                                    h.Class(`ensemble-connector ${contact.id}`),
                                    h.Style({
                                      height: `${spacing}px`,
                                      // Match the SVG's xMidYMid meet geometry inside the fixed diagram plane.
                                      left: `${1 + 12 + (894 - (505 * 1400) / 830) / 2 + (contact.x * 505) / 830}px`,
                                      top: `${1 + 32 + (contact.y * 505) / 830}px`,
                                      transform: `translateZ(${(layers.length - 1 - index) * spacing}px) rotateX(-90deg)`
                                    })
                                  ],
                                  []
                                )
                              )
                            )
                        : [])
                    ]
                  ),
                  ...(!model.flat
                    ? [
                        h.div(
                          [h.Class("ensemble-gesture-hint")],
                          ["Drag to rotate · wheel or pinch to zoom · touch: scroll vertically"]
                        )
                      ]
                    : []),
                  ...(model.flat
                    ? [h.div([h.Class("ensemble-orientation")], [`ADVICEE ${model.active + 1} / INSPECTION VIEW`])]
                    : [])
                ]
              )
            ]
          ),
          h.div(
            [h.Class("ensemble-camera")],
            [
              range("Tilt", "tilt", 0, 65, model.tilt),
              range("Rotation", "turn", -180, 180, model.turn),
              range("Layer spacing", "spacing", 70, 190, model.spacing),
              range("Zoom", "zoom", 20, 200, model.zoom)
            ]
          ),
          h.p(
            [h.Class("ensemble-evidence-key")],
            [
              "Diagram: blue = state / decision · gray = external work · orange = transition · purple dashed = command. Select a stage to inspect its checked state."
            ]
          ),
          h.div(
            [h.Class("ensemble-resource-key")],
            [
              h.span([h.Class("capacity-key")], ["● Resident capacity → Admission & capacity"]),
              h.span([h.Class("jev-key")], ["● Jev backend → Jev request attempt"]),
              h.p(
                [],
                [
                  "Green contacts share the resident’s global capacity ledger. Gold contacts share its Jev request pool. Advicee layers show their own checked state at the same resident event; contention is decided by Bend. Jev responses are simulated. Items and bytes can stay reserved after execution slots are released."
                ]
              )
            ]
          )
        ]
      ),
      h.div(
        [h.Class("ensemble-inspector-heading")],
        [
          h.h2([], [`Resident controls · ${active.agent.agent} selected`]),
          h.p(
            [],
            [
              run && !run.agentScopes.length
                ? "Scripted replay: no event generator is attached. Backend/native profiles, playback, history and replay files apply to the whole resident."
                : `Edit pace, duration, bursts, size and suspension target ${active.agent.agent}. Backend/native profiles, playback, history and replay files apply to the whole resident.`
            ]
          )
        ]
      ),
      lazyInspector(inspectorView, [model.resident, h, action, changed, active, scopes])
    ]
  )
}
