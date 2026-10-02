import type { HtmlBuilder } from "foldkit/html";
import type { CanonicalProjection } from "../../../src/canonical/adapter";

export const AGENT_COLORS = ["#427bc4", "#a16acc", "#169e8c", "#d48534", "#cc6184", "#638e3e"];
export interface AgentScope { readonly agent: string; readonly partition: number; readonly seed: number }

/** Shared event status; resource utilization lives beside its diagram stage. */
export const sharedResidentView = <Message>(h: HtmlBuilder<Message>,
  agents: readonly AgentScope[], sequence: number, now: number,
  projection?: CanonicalProjection, syntheticCapacity = false) => {
  return h.section([h.Class("shared-resident"), h.AriaLabel("Shared resident status")], [
    h.div([h.Class("shared-resident-heading")], [h.strong([], ["ONE RESIDENT"]),
      h.span([], [`${agents.length} advicee${agents.length === 1 ? "" : "s"} · ${sequence < 0 ? "initial state" : `event ${sequence}`} · ${now} ms`])]),
    h.p([], ["Shared production pools: 8 preparation slots and 8 Jev request slots."]),
    ...(projection ? [h.p([h.AriaLabel("Shared resident resources")], [
      `Preparation ${projection.dispatch.running.filter(item => item.preparation).length}/8 · `,
      `Jev ${projection.dispatch.requests.length}/8 · Queued work ${projection.dispatch.queued.length} · `,
      `Reserved ${projection.global.items} items, ${projection.global.bytes} bytes`,
    ])] : []),
    ...(syntheticCapacity ? [h.p([h.Class("synthetic-profile")], [
      "Synthetic capacity override for this experiment; execution pools remain fixed at 8/8.",
    ])] : []),
  ]);
};
