import { resourceMeter } from "./resource-details";
import type { CapacityMetadata } from "../../monkey-business/src/index";
import type { HtmlBuilder } from "foldkit/html";
import type { CanonicalProjection } from "../../../src/canonical/adapter";

export const AGENT_COLORS = ["#427bc4", "#a16acc", "#169e8c", "#d48534", "#cc6184", "#638e3e"];
export interface AgentScope { readonly agent: string; readonly partition: number; readonly seed: number }

/** All displayed utilization comes directly from the single checked resident snapshot. */
export const sharedResidentView = <Message>(h: HtmlBuilder<Message>, projection: CanonicalProjection,
  agents: readonly AgentScope[], sequence: number, now: number, metadata?: CapacityMetadata) => {
  return h.section([h.Class("shared-resident"), h.AriaLabel("Shared resident resources")], [
    h.div([h.Class("shared-resident-heading")], [h.strong([], ["ONE RESIDENT"]),
      h.span([], [`${agents.length} agent${agents.length === 1 ? "" : "s"} · ${sequence < 0 ? "initial state" : `event ${sequence}`} · ${now} ms`])]),
    h.div([h.Class("shared-secondary-resources")], [
      resourceMeter(h, "Edit permits · shared by all agents", projection.admissions.reduce((n,a) => n + a.permits.length, 0), metadata?.permits?.residentLimit),
      resourceMeter(h, "Background collectors · shared by all agents", projection.collection.claims.length, metadata?.collectors?.capacity),
    ]),
  ]);
};
