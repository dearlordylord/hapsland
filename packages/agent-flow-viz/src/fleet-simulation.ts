import { Schema } from "effect";
import type { HtmlBuilder } from "foldkit/html";
import { numberRecords } from "@hapsland/agent-flow-projection";
import { preparationSnapshot } from "./preparation-mini";
import { productionFlowView, INFRASTRUCTURE_CONTACTS } from "./production-flow-view";
import { projectAgent } from "../../monkey-business/src/index";
import { sharedResidentView, AGENT_COLORS } from "./shared-resident-view";
import {
  SimulationModel as ResidentModel, initialSimulation as initialResident,
  actSimulation as actResident, changeSimulation as changeResident,
  tickSimulation as tickResident, simulationView as residentView,
  simulationRun, selectSimulationAgent,
} from "./simulation";

export const SimulationModel = Schema.Struct({
  resident: ResidentModel, count: Schema.String, active: Schema.Number,
  tilt: Schema.String, turn: Schema.String, spacing: Schema.String, zoom: Schema.String,
  flat: Schema.Boolean, playing: Schema.Boolean, feedback: Schema.String,
});
export type SimulationModel = typeof SimulationModel.Type;
export const initialSimulation: SimulationModel = {
  resident: initialResident, count: "1", active: 0, tilt: "48", turn: "-16", spacing: "130", zoom: "72",
  flat: false, playing: false, feedback: "Choose the number of agents, then start one shared resident.",
};
const displayScopes = (model: ResidentModel) => {
  const run = simulationRun();
  if (run?.agentScopes.length) return run.agentScopes;
  const partitions = run?.projection.partitions.map(record => record.partition) ?? [];
  return (partitions.length ? partitions : [1]).map(partition => ({
    agent: `agent-${partition}`, partition, seed: run?.exportReplay().config.seed ?? Number(model.seed),
  }));
};
const reconcile = (model: SimulationModel, resident: ResidentModel): SimulationModel => ({ ...model, resident, playing: resident.playing, feedback: resident.feedback });
export const changeSimulation = (model: SimulationModel, field: string, raw: string): SimulationModel => {
  if (["count", "tilt", "turn", "spacing", "zoom"].includes(field)) return { ...model, [field]: raw,
    feedback: field === "count" ? "Agent count is a draft. Start resident resets the resident with this many independent generators." : model.feedback };
  return reconcile(model, changeResident(model.resident, field, raw));
};
export const actSimulation = (model: SimulationModel, action: string): SimulationModel => {
  if (action === "fleet:start" || action === "start") {
    const count = Number(model.count);
    if (!Number.isSafeInteger(count) || count < 1 || count > 6)
      return { ...model, feedback: "Agent count must be an integer from 1 to 6. The resident is unchanged." };
    const resident = actResident({ ...model.resident, agentCount: model.count, agentId: "agent-1" }, "start");
    return { ...reconcile(model, resident), active: 0, feedback: resident.feedback };
  }
  if (action.startsWith("fleet:select:")) {
    const index = Number(action.slice(13));
    const scope = displayScopes(model.resident)[index];
    return scope ? reconcile({ ...model, active: index }, selectSimulationAgent(model.resident, scope.agent)) : model;
  }
  if (action === "fleet:flat") return { ...model, flat: !model.flat };
  if (action === "fleet:camera") return { ...model, tilt: "48", turn: "-16", spacing: "130", zoom: "72", flat: false };
  if (action === "fleet:play" || action === "fleet:step") {
    const ready = simulationRun() ? model : actSimulation(model, "fleet:start");
    return reconcile(ready, actResident(ready.resident, action === "fleet:step" ? "step" : "play"));
  }
  if (action.startsWith("fleet:inspect:")) {
    const [, , raw, stage] = action.split(":");
    const selected = actSimulation(model, `fleet:select:${raw}`);
    return reconcile({ ...selected, flat: true }, actResident(selected.resident, `focus:${stage}`));
  }
  const result = actResident(model.resident, action);
  const resident = action === "load" && result.feedback.startsWith("Replay reconstructed")
    ? selectSimulationAgent(result, displayScopes(result)[0].agent) : result;
  return { ...reconcile(model, resident), ...(action === "load" && resident.feedback.startsWith("Replay reconstructed")
    ? { active: 0, count: resident.agentCount } : {}) };
};
export const tickSimulation = (model: SimulationModel, deltaMs: number): SimulationModel =>
  reconcile(model, tickResident(model.resident, deltaMs));

const colors = AGENT_COLORS;
const bounded = (raw: string, low: number, high: number, fallback: number) =>
  Number.isFinite(Number(raw)) ? Math.max(low, Math.min(high, Number(raw))) : fallback;
export const simulationView = <Message>(model: SimulationModel, h: HtmlBuilder<Message>,
  action: (action: string) => Message, changed: (field: string, raw: string) => Message) => {
  const button = (label: string, name: string, selected = false) => h.button([
    h.Type("button"), h.Class(selected ? "selected" : ""), h.OnClick(action(name)),
  ], [label]);
  const range = (name: string, field: string, min: number, max: number, value: string) => h.label([], [name,
    h.input([h.Type("range"), h.AriaLabel(name), h.Min(String(min)), h.Max(String(max)), h.Value(value), h.OnInput(raw => changed(field, raw))]),
  ]);
  const run = simulationRun();
  const observations = run?.observations ?? [];
  const current = model.resident.selected < 0 ? observations.at(-1) : observations.find(frame => frame.sequence === model.resident.selected);
  const history = observations.filter(frame => frame.sequence <= (current?.sequence ?? -1));
  const projection = current?.after ?? run?.projection;
  const numbers = numberRecords(observations[0]?.sequence === 0 ? history : []);
  const scopes = displayScopes(model.resident);
  const layers = scopes.map((agent, index) => {
    const local = projection ? projectAgent(projection, agent.partition) : undefined;
    const ownedHistory = history.filter(frame => frame.partition === agent.partition);
    const last = current?.partition === agent.partition ? {
      ...current, before: projectAgent(current.before, agent.partition), after: projectAgent(current.after, agent.partition), origin: "manual" as const,
    } : undefined;
    return { agent, index, local, current: ownedHistory.at(-1), history: ownedHistory, numbers, last };
  });
  const spacing = bounded(model.spacing, 70, 190, 130);
  const sceneHeight = model.flat ? 660 : 630 + Math.max(0, layers.length - 3) * 75;
  const active = layers[Math.min(model.active, layers.length - 1)];
  return h.div([h.Id("monkey-business"), h.Class("ensemble")], [
    h.section([h.Id("agent-ensemble"), h.Class(`ensemble-panel ${model.flat ? "is-flat" : "is-spatial"}`)], [
      h.div([h.Class("ensemble-heading")], [
        h.div([], [h.p([h.Class("eyebrow")], ["MONKEY BUSINESS / MULTI-AGENT"]), h.h2([], ["One resident. Independent agents."]),
          h.p([], ["Each agent generates its own events. All layers share one capacity ledger, one Jev pool and one timeline."])]),
      ]),
      h.div([h.Class("ensemble-toolbar")], [
        h.form([h.OnSubmit(action("fleet:start")), h.Class("ensemble-start")], [h.label([], ["Agents",
          h.input([h.Type("number"), h.AriaLabel("Agent count"), h.Min("1"), h.Max("6"), h.Step("1"), h.Value(model.count), h.OnInput(raw => changed("count", raw))])]),
          h.button([h.Type("submit"), h.Class("ensemble-primary")], ["Start resident"])]),
        button(model.playing ? "Pause resident" : "Play resident", "fleet:play"), button("Step resident", "fleet:step"),
        h.span([h.Class("ensemble-toolbar-divider")], []),
        button(model.flat ? "3D layers" : "Focus selected agent", "fleet:flat", model.flat), button("Reset view", "fleet:camera"),
      ]),
      h.p([h.Class("ensemble-feedback"), h.Role("status")], [model.feedback]),
      ...(projection ? [sharedResidentView(h, projection, scopes, current?.sequence ?? -1, current?.time ?? run?.now ?? 0)] : []),
      h.div([h.Class("ensemble-layout")], [
        h.aside([h.Class("ensemble-agents"), h.AriaLabel("Agent layers")], [
          h.p([h.Class("ensemble-sidebar-label")], ["AGENT LAYERS"]),
          h.p([h.Class("ensemble-hover-hint")], ["Hover to reveal a layer. Click to select."]),
          ...layers.map(({ agent, index, current, history }) => h.button([
            h.Type("button"), h.Class(`ensemble-agent agent-index-${index} ${index === model.active ? "selected" : ""}`),
            h.Style({ borderLeftColor: colors[index] }), h.OnClick(action(`fleet:select:${index}`)),
            h.AriaLabel(`Select agent ${index + 1}`),
          ], [h.strong([], [`Agent ${String(index + 1).padStart(2, "0")}`]),
            h.span([], [run && !run.agentScopes.length ? "Scripted events" : `Seed ${agent.seed}`]), h.span([], [`${model.playing ? "Running" : "Paused"} · ${history.length} retained events`]),
            h.small([], [current?.event.kind ?? "Ready to start"])])),
          h.p([h.Class("ensemble-scope")], ["Select an agent for its generator controls and stage inspection. Playback, history and replay belong to the whole resident."]),
        ]),
        h.div([h.Class("ensemble-viewport"), h.Style({ height: `${sceneHeight}px` }), h.AriaLabel("Three-dimensional agent diagram")], [
          h.div([h.Class("ensemble-scene"), h.Style({
            transform: model.flat ? "none" : `translateY(${-35 + Math.max(0, layers.length - 3) * 30}px) scale(${bounded(model.zoom, 35, 100, 72) / 100}) rotateX(${bounded(model.tilt, 0, 65, 48)}deg) rotateZ(${bounded(model.turn, -180, 180, -16)}deg) translateZ(${-(layers.length - 1) * spacing / 2}px)`,
          })], [
            ...layers.filter(layer => !model.flat || layer.index === model.active).map(({ agent, index, local, last, history, numbers }) => h.div([
              h.Class(`ensemble-layer agent-index-${index} ${index === model.active ? "is-selected" : ""}`),
              h.Style({ transform: model.flat ? "none" : `translateZ(${index * spacing}px)`, borderColor: colors[index] }),
            ], [
              h.div([h.Class("ensemble-layer-title"), h.Style({ color: colors[index] })], [
                h.strong([], [`AGENT ${String(index + 1).padStart(2, "0")}`]), h.span([], [`${current?.time ?? run?.now ?? 0} ms · seed ${agent.seed}`]),
              ]),
              ...(local ? [productionFlowView(h, local, last,
                false, place => action(`fleet:inspect:${index}:${place}`), preparationSnapshot(history.map(frame => ({ ...frame, origin: "manual" as const }))), numbers, true)]
                : [h.div([h.Class("ensemble-empty")], [h.strong([], ["Your agent diagram starts here"]), h.p([], ["Start one resident to connect independent Monkey Business generators."])])]),
            ])),
            ...(!model.flat ? layers.slice(0, -1).filter(layer => layer.local).flatMap(({ index }) => INFRASTRUCTURE_CONTACTS.map(contact => h.div([
              h.Class(`ensemble-connector ${contact.id}`),
              h.Style({ height: `${spacing}px`,
                // Match the SVG's xMidYMid meet geometry inside the fixed diagram plane.
                left: `${1 + 12 + (894 - 505 * 1400 / 830) / 2 + contact.x * 505 / 830}px`,
                top: `${1 + 32 + contact.y * 505 / 830}px`,
                transform: `translateZ(${index * spacing}px) rotateX(90deg)`,
              }),
            ], []))) : []),
          ]),
          ...(!model.flat ? [h.div([h.Class("ensemble-gesture-hint")], ["Drag to rotate · touch: drag sideways, scroll vertically"])] : []),
          h.div([h.Class("ensemble-orientation")], [model.flat ? `AGENT ${model.active + 1} / INSPECTION VIEW` : "X / Y · SYSTEM FLOW     Z · AGENTS"]),
        ]),
      ]),
      h.div([h.Class("ensemble-camera")], [range("Tilt", "tilt", 0, 65, model.tilt), range("Rotation", "turn", -180, 180, model.turn),
        range("Layer spacing", "spacing", 70, 190, model.spacing), range("Zoom", "zoom", 35, 100, model.zoom)]),
      h.p([h.Class("ensemble-evidence-key")], ["Diagram: blue = state / decision · gray = external work · orange = transition · purple dashed = command. Select a stage to inspect its checked state."]),
      h.div([h.Class("ensemble-resource-key")], [h.span([h.Class("capacity-key")], ["● Resident capacity → Admission & capacity"]), h.span([h.Class("jev-key")], ["● Jev backend → Jev request attempt"]),
        h.p([], ["Green contacts share the resident’s global capacity ledger. Gold contacts share its Jev request pool. Agent layers show their own checked state at the same resident event; contention is decided by Bend. Jev responses are simulated."])]),
    ]),
    h.div([h.Class("ensemble-inspector-heading")], [h.h2([], [`Resident controls · ${active.agent.agent} selected`]),
      h.p([], [run && !run.agentScopes.length ? "Scripted replay: no event generator is attached. Backend/native profiles, playback, history and replay files apply to the whole resident." : `Edit pace, bursts, size and suspension target ${active.agent.agent}. Backend/native profiles, playback, history and replay files apply to the whole resident.`])]),
    residentView(model.resident, h, action, changed, false, active.local ? { projection: active.local, observations: active.history } : undefined),
  ]);
};
