import type { HtmlBuilder } from "foldkit/html";

export const AGENT_COLORS = ["#427bc4", "#a16acc", "#169e8c", "#d48534", "#cc6184", "#638e3e"];
export interface AgentScope { readonly agent: string; readonly partition: number; readonly seed: number }

/** Shared event status; resource utilization lives beside its diagram stage. */
export const sharedResidentView = <Message>(h: HtmlBuilder<Message>,
  agents: readonly AgentScope[], sequence: number, now: number) => {
  return h.section([h.Class("shared-resident"), h.AriaLabel("Shared resident status")], [
    h.div([h.Class("shared-resident-heading")], [h.strong([], ["ONE RESIDENT"]),
      h.span([], [`${agents.length} agent${agents.length === 1 ? "" : "s"} · ${sequence < 0 ? "initial state" : `event ${sequence}`} · ${now} ms`])]),
  ]);
};
