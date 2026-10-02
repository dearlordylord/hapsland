import type { HtmlBuilder } from "foldkit/html";
import type { CanonicalProjection } from "../../../src/canonical/adapter";
import type { AgentScope } from "./shared-resident-view";
import type { CapacityMetadata } from "../../monkey-business/src/index";

export const adviceePermitLimit = (metadata: CapacityMetadata | undefined, partition: number | undefined): number | undefined =>
  partition === undefined ? undefined : metadata?.permits?.adviceeLimits?.find(entry => entry.partition === partition)?.limit ?? metadata?.permits?.adviceeLimit;

export const resourceMeter = <Message>(h: HtmlBuilder<Message>, label: string, used: number, maximum?: number) =>
  h.div([h.Class("resource-meter")], [h.span([], [label]), h.strong([], [maximum === undefined ? `${used} used · limit not recorded` : `${used} / ${maximum}`]),
    ...(maximum === undefined ? [] : [h.div([h.Class("resource-meter-track"), h.Role("img"), h.AriaLabel(`${label}: ${used} of ${maximum}`)], [h.span([h.Style({ width: `${Math.min(100, maximum > 0 ? used / maximum * 100 : 0)}%` })], [])])])]);

export const stageResourceDetails = <Message>(h: HtmlBuilder<Message>, stage: string, local: CanonicalProjection, resident: CanonicalProjection, metadata?: CapacityMetadata, candidate?: { bytes: number; items: number; decision?: "fits" | "limited" }, partition?: number, selectedGroup?: number, selectedRound?: number, agents?: readonly AgentScope[]) => {
  const rows = [];
  const knownGroups = [...resident.delivery.slots.map(s => s.group), ...resident.delivery.counters.map(c => c.group), ...resident.collection.claims.map(c => c.group), ...(metadata?.deliveryGroups ?? []).map(binding => binding.group)];
  if (selectedGroup !== undefined && !knownGroups.includes(selectedGroup)) selectedGroup = undefined;
  if (stage === "admission") {
    const scopedPartition = partition ?? (local.partitions.length === 1 ? local.partitions[0].partition : local.admissions.length === 1 ? local.admissions[0].partition : undefined);
    const usage = resident.partitions.find(p => p.partition === scopedPartition);
    rows.push(h.p([], ["Selected agent / partition · common ledger"]), resourceMeter(h, "Items", usage?.items ?? 0, resident.limits.partitionItems), resourceMeter(h, "Bytes", usage?.bytes ?? 0, resident.limits.partitionBytes), resourceMeter(h, "Edit permits", local.admissions.filter(a => a.partition === scopedPartition).reduce((n, a) => n + a.permits.length, 0), adviceePermitLimit(metadata, scopedPartition)));
  }
  if (stage === "scheduling" || stage === "preparation") rows.push(resourceMeter(h, "Resident preparation workers · shared by all agents", resident.dispatch.running.filter(w => w.preparation).length, resident.executionLimits.preparation));
  if (stage === "effect") rows.push(h.p([], ["One resident Jev permit pool, mirrored across agent layers. Occupied positions are request permits; Jev responses are simulated."]), h.ul([h.Class("jev-owner-details")], [...resident.dispatch.requests].sort((left, right) => left.request - right.request).map(request => h.li([], [`${agents?.find(agent => agent.partition === request.partition)?.agent ?? `partition ${request.partition}`} · request #${request.request} · ${request.started ? "started" : "authorized, not started"}`]))));
  if (["authorization", "effect", "jev"].includes(stage)) rows.push(resourceMeter(h, "Resident Jev permits · shared by all agents", resident.dispatch.requests.length, resident.executionLimits.jevRequests));
  if (stage === "collection" || stage === "advice") {
    rows.push(resourceMeter(h, "Resident background collectors", resident.collection.claims.length, metadata?.collectors?.capacity), h.ul([], resident.collection.claims.map(c => h.li([], [`Group ${c.group} · collector token ${c.owner}`]))), h.ul([], local.collection.ready.map(id => h.li([], [`Advice ${id} · ${local.collection.leases.some(l => l.advice === id) ? "leased" : "free"}`]))));
  }
  if (stage === "delivery") {
    rows.push(h.p([], [candidate ? `Latest supplied simulated encoded bytes: ${candidate.bytes} / 10240 · ${candidate.decision === "fits" ? "Fits" : candidate.decision === "limited" ? "Does not fit" : "Fit decision not recorded"} · ${candidate.items} items. Native serialization is not measured.` : "No candidate · encoded bytes not supplied"]));
    if (selectedGroup === undefined) rows.push(h.p([], ["Select a delivery group to inspect its exclusive output slot."]));
    else {
      const slot = resident.delivery.slots.find(s => s.group === selectedGroup);
      rows.push(h.p([], [`Group ${selectedGroup} · ${slot ? `Occupied · round ${slot.round} · ${slot.phase}` : "Free · no active output slot"}`]));
    }
  }
  if (stage === "round") {
    const round = local.rounds.find(r => r.id === selectedRound);
    if (round === undefined || selectedGroup === undefined) rows.push(h.p([], ["Select a current round and delivery group to inspect continuation use."]));
    else {
      const counter = resident.delivery.counters.find(c => c.round === round.id && c.group === selectedGroup);
      const budget = metadata?.continuationBudget;
      rows.push(h.p([], [`Group ${selectedGroup} · round ${round.id} · continuations ${counter?.used ?? 0}${budget === undefined ? " used · limit not recorded" : ` / ${budget}`}`]));
      if (budget !== undefined) rows.push(h.div([h.Class("continuation-marks"), h.AriaLabel(`Round ${round.id} continuation budget`)], Array.from({ length: budget }, (_, index) => h.span([h.Class(index < (counter?.used ?? 0) ? "used" : "available")], [index < (counter?.used ?? 0) ? "Used" : "Available"]))));
    }
  }

  return h.div([h.Class("stage-resource-details")], rows);
};
