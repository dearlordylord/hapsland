import { Schema } from "effect";
import type { HtmlBuilder } from "foldkit/html";
import { numberRecords } from "@hapsland/agent-flow-projection";
import { preparationSnapshot } from "./preparation-mini";
import { productionFlowView, INFRASTRUCTURE_CONTACTS } from "./production-flow-view";
import {
  SimulationModel as AgentModel, initialSimulation as initialAgent,
  actSimulation as actAgent, changeSimulation as changeAgent,
  tickSimulation as tickAgent, simulationView as agentView,
  captureSimulationContext, restoreSimulationContext, emptySimulationContext,
  type SimulationContext,
} from "./simulation";

export const SimulationModel = Schema.Struct({
  agents: Schema.Array(AgentModel), count: Schema.String, active: Schema.Number,
  tilt: Schema.String, turn: Schema.String, spacing: Schema.String, zoom: Schema.String,
  flat: Schema.Boolean, playing: Schema.Boolean, feedback: Schema.String,
});
export type SimulationModel = typeof SimulationModel.Type;
export const initialSimulation: SimulationModel = {
  agents: [initialAgent], count: "1", active: 0, tilt: "48", turn: "-16", spacing: "130", zoom: "72",
  flat: false, playing: false, feedback: "Choose the number of agents, then start the ensemble.",
};
const contexts: SimulationContext[] = [];
const inAgent = <T>(index: number, operation: () => T): T => {
  restoreSimulationContext(contexts[index] ?? emptySimulationContext());
  try { return operation(); }
  finally { contexts[index] = captureSimulationContext(); }
};
const reconcile = (model: SimulationModel, agents: readonly AgentModel[]): SimulationModel =>
  ({ ...model, agents, playing: agents.some(agent => agent.playing) });
export const changeSimulation = (model: SimulationModel, field: string, raw: string): SimulationModel => {
  if (["count", "tilt", "turn", "spacing", "zoom"].includes(field)) return { ...model, [field]: raw,
    feedback: field === "count" ? "Agent count is a draft. Start ensemble applies it using the selected agent’s settings and seed." : model.feedback };
  return reconcile(model, model.agents.map((agent, index) => index === model.active
    ? inAgent(index, () => changeAgent(agent, field, raw)) : agent));
};
export const actSimulation = (model: SimulationModel, action: string): SimulationModel => {
  if (action === "fleet:start") {
    const count = Number(model.count);
    const seed = Number(model.agents[model.active].seed);
    if (!Number.isSafeInteger(count) || count < 1 || count > 6)
      return { ...model, feedback: "Agent count must be an integer from 1 to 6. Existing runs are unchanged." };
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
      return { ...model, feedback: "Seed must be an integer from 0 to 4294967295. Existing runs are unchanged." };
    // Each independent generator receives a reproducible distinct seed. These are
    // independent checked runs, not a visual simulation of shared admission.
    const previous = contexts.slice();
    const template = model.agents[model.active];
    const agents = Array.from({ length: count }, (_, index) => {
      contexts[index] = emptySimulationContext();
      return inAgent(index, () => actAgent({ ...template, agentId: `agent-${index + 1}`, seed: String((seed + Math.imul(index, 2654435761)) >>> 0) }, "start"));
    });
    const failed = agents.find((_, index) => !contexts[index]?.run);
    if (failed) {
      contexts.splice(0, contexts.length, ...previous);
      return { ...model, feedback: failed.feedback };
    }
    contexts.length = count;
    return { ...model, agents, active: 0, playing: false, feedback: `${count} independently seeded agent${count === 1 ? "" : "s"}. Start playback or advance one event per agent.` };
  }
  if (action.startsWith("fleet:select:")) {
    const index = Number(action.slice(13));
    return Number.isInteger(index) && index >= 0 && index < model.agents.length ? { ...model, active: index } : model;
  }
  if (action === "fleet:flat") return { ...model, flat: !model.flat };
  if (action === "fleet:camera") return { ...model, tilt: "48", turn: "-16", spacing: "130", zoom: "72", flat: false };
  if (action === "fleet:play" || action === "fleet:step") {
    const agents = model.agents.map((agent, index) => inAgent(index, () => {
      const ready = contexts[index]?.run ? agent : actAgent(agent, "start");
      return action === "fleet:step" ? actAgent(ready, "step") : ready.playing === !model.playing ? ready : actAgent(ready, "play");
    }));
    return reconcile(model, agents);
  }
  if (action.startsWith("fleet:inspect:")) {
    const [, , raw, stage] = action.split(":");
    const index = Number(raw);
    return reconcile({ ...model, active: index, flat: true }, model.agents.map((agent, i) => i === index
      ? inAgent(i, () => actAgent(agent, `focus:${stage}`)) : agent));
  }
  return reconcile(model, model.agents.map((agent, index) => index === model.active
    ? inAgent(index, () => actAgent(agent, action)) : agent));
};
export const tickSimulation = (model: SimulationModel, deltaMs: number): SimulationModel =>
  reconcile(model, model.agents.map((agent, index) => agent.playing ? inAgent(index, () => tickAgent(agent, deltaMs)) : agent));

const colors = ["#427bc4", "#a16acc", "#169e8c", "#d48534", "#cc6184", "#638e3e"];
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
  const layers = model.agents.map((agent, index) => {
    const run = contexts[index]?.run;
    const observations = run?.observations ?? [];
    const current = agent.selected < 0 ? observations.at(-1) : observations.find(frame => frame.sequence === agent.selected);
    const history = observations.filter(frame => frame.sequence <= (current?.sequence ?? -1));
    const numbers = numberRecords(observations[0]?.sequence === 0 ? history : []);
    return { agent, index, run, current, history, numbers };
  });
  const spacing = bounded(model.spacing, 70, 190, 130);
  const sceneHeight = model.flat ? 660 : 630 + Math.max(0, model.agents.length - 3) * 75;
  const active = model.agents[model.active];
  return h.div([h.Id("monkey-business"), h.Class("ensemble")], [
    h.section([h.Id("agent-ensemble"), h.Class(`ensemble-panel ${model.flat ? "is-flat" : "is-spatial"}`)], [
      h.div([h.Class("ensemble-heading")], [
        h.div([], [h.p([h.Class("eyebrow")], ["MONKEY BUSINESS / MULTI-AGENT"]), h.h2([], ["One system. Independent agents."]),
          h.p([], ["Each plane is the same system diagram, driven by its own seeded event stream."])]),
      ]),
      h.div([h.Class("ensemble-toolbar")], [
        h.form([h.OnSubmit(action("fleet:start")), h.Class("ensemble-start")], [h.label([], ["Agents",
          h.input([h.Type("number"), h.AriaLabel("Agent count"), h.Min("1"), h.Max("6"), h.Step("1"), h.Value(model.count), h.OnInput(raw => changed("count", raw))])]),
          h.button([h.Type("submit"), h.Class("ensemble-primary")], ["Start ensemble"])]),
        button(model.playing ? "Pause all" : "Play all", "fleet:play"), button("Step all", "fleet:step"),
        h.span([h.Class("ensemble-toolbar-divider")], []),
        button(model.flat ? "3D layers" : "Focus selected agent", "fleet:flat", model.flat), button("Reset view", "fleet:camera"),
      ]),
      h.p([h.Class("ensemble-feedback"), h.Role("status")], [model.feedback]),
      h.div([h.Class("ensemble-layout")], [
        h.aside([h.Class("ensemble-agents"), h.AriaLabel("Agent layers")], [
          h.p([h.Class("ensemble-sidebar-label")], ["AGENT LAYERS"]),
          h.p([h.Class("ensemble-hover-hint")], ["Hover to reveal a layer. Click to select."]),
          ...layers.map(({ agent, index, run, current }) => h.button([
            h.Type("button"), h.Class(`ensemble-agent agent-index-${index} ${index === model.active ? "selected" : ""}`),
            h.Style({ borderLeftColor: colors[index] }), h.OnClick(action(`fleet:select:${index}`)),
            h.AriaLabel(`Select agent ${index + 1}`),
          ], [h.strong([], [`Agent ${String(index + 1).padStart(2, "0")}`]),
            h.span([], [`Seed ${agent.seed}`]), h.span([], [`${agent.playing ? "Running" : "Paused"} · ${run?.eventCount ?? 0} events`]),
            h.small([], [current?.event.kind ?? "Ready to start"])])),
          h.p([h.Class("ensemble-scope")], ["Controls and event history below belong to the selected agent. Play all and Step all operate on every layer."]),
        ]),
        h.div([h.Class("ensemble-viewport"), h.Style({ height: `${sceneHeight}px` }), h.AriaLabel("Three-dimensional agent diagram")], [
          h.div([h.Class("ensemble-scene"), h.Style({
            transform: model.flat ? "none" : `translateY(${-35 + Math.max(0, model.agents.length - 3) * 30}px) scale(${bounded(model.zoom, 35, 100, 72) / 100}) rotateX(${bounded(model.tilt, 0, 65, 48)}deg) rotateZ(${bounded(model.turn, -180, 180, -16)}deg) translateZ(${-(model.agents.length - 1) * spacing / 2}px)`,
          })], [
            ...layers.filter(layer => !model.flat || layer.index === model.active).map(({ agent, index, run, current, history, numbers }) => h.div([
              h.Class(`ensemble-layer agent-index-${index} ${index === model.active ? "is-selected" : ""}`),
              h.Style({ transform: model.flat ? "none" : `translateZ(${index * spacing}px)`, borderColor: colors[index] }),
            ], [
              h.div([h.Class("ensemble-layer-title"), h.Style({ color: colors[index] })], [
                h.strong([], [`AGENT ${String(index + 1).padStart(2, "0")}`]), h.span([], [`${run?.now ?? 0} ms · seed ${agent.seed}`]),
              ]),
              ...(run ? [productionFlowView(h, current?.after ?? run.projection, current ? { ...current, origin: "manual" } : undefined,
                false, place => action(`fleet:inspect:${index}:${place}`), preparationSnapshot(history.map(frame => ({ ...frame, origin: "manual" as const }))), numbers, true)]
                : [h.div([h.Class("ensemble-empty")], [h.strong([], ["Your agent diagram starts here"]), h.p([], ["Start the ensemble to create independent Monkey Business runs."])])]),
            ])),
            ...(!model.flat ? layers.slice(0, -1).filter(layer => layer.run).flatMap(({ index }) => INFRASTRUCTURE_CONTACTS.map(contact => h.div([
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
        h.p([], ["Agents on the same resident share its global capacity ledger. The green contacts show that product topology; this demo keeps separate ledgers per agent. Gold contacts show the common Jev backend target; responses are synthetic. No cross-agent contention is simulated."])]),
    ]),
    h.div([h.Class("ensemble-inspector-heading")], [h.h2([], [`Agent ${String(model.active + 1).padStart(2, "0")} · controls & inspection`]),
      h.p([], [`Seed ${active.seed}. Settings, history navigation and replay files apply to this agent.`])]),
    inAgent(model.active, () => agentView(active, h, action, changed, false)),
  ]);
};
