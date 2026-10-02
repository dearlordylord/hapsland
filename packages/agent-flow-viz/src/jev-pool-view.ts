import type { HtmlBuilder } from "foldkit/html";
import type { CanonicalProjection } from "../../../src/canonical/adapter";
import { AGENT_COLORS, type AgentScope } from "./shared-resident-view";

/** Fleet scopes supply one stable ownership palette to every layer. */
export const jevRequestOwner = (partition: number, agents: readonly AgentScope[] = []) => {
  const index = agents.findIndex(agent => agent.partition === partition);
  return index < 0
    ? { label: `partition ${partition}`, short: partition < 10 ? `P${partition}` : "P", color: AGENT_COLORS[(partition - 1) % AGENT_COLORS.length] }
    : { label: agents[index].agent, short: `A${index + 1}`, color: AGENT_COLORS[index % AGENT_COLORS.length] };
};

/** These eight positions mirror the resident's permit pool, not per-agent connections. */
export const jevPoolView = <Message>(h: HtmlBuilder<Message>, x: number, y: number,
  resident: CanonicalProjection, local: CanonicalProjection, agents?: readonly AgentScope[], partition?: number) => {
  const requests = [...resident.dispatch.requests].sort((left, right) => left.request - right.request);
  const localPartition = partition ?? (local.partitions.length === 1 ? local.partitions[0].partition : local.admissions.length === 1 ? local.admissions[0].partition : undefined);
  return h.g([h.Class("stage-jev-pool"), h.AriaLabel(`Shared resident Jev pool: ${requests.length} of ${resident.executionLimits.jevRequests} permits held`)], [
    h.text([h.X(String(x + 13)), h.Y(String(y + 69)), h.FontSize("9"), h.Fill("#435670"), h.Class("stage-jev-total")], [`Shared Jev pool · ${requests.length}/${resident.executionLimits.jevRequests} held`]),
    ...Array.from({ length: resident.executionLimits.jevRequests }, (_, index) => {
      const request = requests[index];
      const owner = request ? jevRequestOwner(request.partition, agents) : undefined;
      const description = request ? `${owner!.label} · request #${request.request} · ${request.started ? "started" : "authorized, not started"}` : "Free Jev request permit";
      const slotX = x + 13 + index * 25;
      return h.g([h.Class(`stage-jev-slot ${request ? "occupied" : "free"}`), h.Role("img"), h.AriaLabel(description)], [
        h.title([], [description]),
        h.rect([h.X(String(slotX)), h.Y(String(y + 77)), h.Width("21"), h.Height("14"), h.Rx("2"), h.Fill(owner?.color ?? "#fafcfe"), h.Stroke(owner?.color ?? "#bac9dc")], []),
        h.text([h.X(String(slotX + 10.5)), h.Y(String(y + 87)), h.TextAnchor("middle"), h.FontSize("8"), h.FontWeight("700"), h.Fill(owner ? "#000000" : "#72859c")], [owner?.short ?? "–"]),
      ]);
    }),
    h.text([h.X(String(x + 13)), h.Y(String(y + 108)), h.FontSize("9"), h.Fill("#435670")], [localPartition === undefined ? "Select an agent for its started count" : `This agent: ${local.dispatch.requests.filter(request => request.partition === localPartition && request.started).length} started`]),
  ]);
};
