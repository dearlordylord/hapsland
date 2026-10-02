import { resourceMeter, residentRetentionDetails } from "./resource-details";
import type { CapacityMetadata } from "../../monkey-business/src/index";
import type { HtmlBuilder } from "foldkit/html";
import type { CanonicalProjection } from "../../../src/canonical/adapter";

export const AGENT_COLORS = ["#427bc4", "#a16acc", "#169e8c", "#d48534", "#cc6184", "#638e3e"];
export interface AgentScope { readonly agent: string; readonly partition: number; readonly seed: number }

/** All displayed utilization comes directly from the single checked resident snapshot. */
export const sharedResidentView = <Message>(h: HtmlBuilder<Message>, projection: CanonicalProjection,
  agents: readonly AgentScope[], sequence: number, now: number, metadata?: CapacityMetadata, inspect?: (stage: "outcomes" | "collection") => Message) => {
  const label = (partition: number) => agents.find(agent => agent.partition === partition)?.agent ?? `partition ${partition}`;
  const color = (partition: number) => AGENT_COLORS[Math.max(0, agents.findIndex(agent => agent.partition === partition)) % AGENT_COLORS.length];
  return h.section([h.Class("shared-resident"), h.AriaLabel("Shared resident resources")], [
    h.div([h.Class("shared-resident-heading")], [h.strong([], ["ONE RESIDENT"]),
      h.span([], [`${agents.length} agent${agents.length === 1 ? "" : "s"} · ${sequence < 0 ? "initial state" : `event ${sequence}`} · ${now} ms`])]),
    ...(metadata?.demoAgentCount === undefined ? [] : [h.p([h.Class("demo-limit-provenance"), h.Title("Demo resident limits; native cache 8 entries / 128 KiB, tickets 256. All retained storage shares the resident ledger.")], [`Demo limits · sized for ${metadata.demoAgentCount} agents`])]),
    h.div([h.Class("shared-resident-resources")], [
      h.div([h.Class("shared-ledger")], [
        h.h3([], ["Global review capacity"]),
        h.div([h.Class("resource-meter")], [h.span([], ["Resident ledger items"]), h.strong([], [`${projection.global.items} / ${projection.limits.globalItems}`])]),
        h.div([h.Class("shared-capacity-bar"), h.Role("img"), h.AriaLabel(`Resident ledger items ${projection.global.items} of ${projection.limits.globalItems}`)], projection.partitions.map(partition => h.span([h.Style({ width: `${partition.items / projection.limits.globalItems * 100}%`, background: color(partition.partition) }), h.Title(`${label(partition.partition)} · ${partition.items} items`)], []))),
        h.p([h.Class("shared-capacity-total")], [`${projection.global.items} / ${projection.limits.globalItems} items · ${projection.global.bytes} / ${projection.limits.globalBytes} bytes`]),
        h.div([h.Class("shared-capacity-bar"), h.Role("img"), h.AriaLabel(`Resident capacity ${projection.global.bytes} of ${projection.limits.globalBytes} bytes`)],
          projection.charges.map(charge => h.span([h.Style({ width: `${charge.bytes / projection.limits.globalBytes * 100}%`, background: color(charge.partition) }),
            h.Title(`${label(charge.partition)} · ${charge.purpose} · ${charge.bytes} bytes`)], []))),
        h.div([h.Class("shared-partition-ledger")], agents.map(agent => {
          const usage = projection.partitions.find(partition => partition.partition === agent.partition);
          return h.span([h.Style({ borderLeftColor: color(agent.partition) })], [`${agent.agent}: ${usage?.items ?? 0} items · ${usage?.bytes ?? 0} B`]);
        })),
        h.small([], [`Per-agent ceiling: ${projection.limits.partitionItems} items / ${projection.limits.partitionBytes} bytes. All agents draw from the global ledger above.`]),
      ]),

    ]),
    h.div([h.Class("shared-secondary-resources")], [
      resourceMeter(h, "Preparation workers · shared by all agents", projection.dispatch.running.filter(w => w.preparation).length, projection.executionLimits.preparation),
      resourceMeter(h, "Edit permits · shared by all agents", projection.admissions.reduce((n,a) => n + a.permits.length, 0), metadata?.permits?.residentLimit),
      resourceMeter(h, "Background collectors · shared by all agents", projection.collection.claims.length, metadata?.collectors?.capacity),
    ]),
    residentRetentionDetails(h, projection, metadata, inspect),
  ]);
};
