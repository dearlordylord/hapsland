import { Option } from "effect";
import type { HtmlBuilder } from "foldkit/html";
import type { CanonicalProjection } from "../../../src/canonical/adapter";
import { AGENT_COLORS, type AgentScope } from "./shared-resident-view";

const ownerLabel = (partition: number, agents: readonly AgentScope[]) => {
  const index = agents.findIndex(agent => agent.partition === partition);
  return index < 0
    ? { label: `partition ${partition}`, short: `P${partition}`, color: AGENT_COLORS[(partition - 1) % AGENT_COLORS.length] }
    : { label: agents[index].agent, short: `A${index + 1}`, color: AGENT_COLORS[index % AGENT_COLORS.length] };
};

/** Two resident pools; independently sorted record IDs never imply paired positions. */
export const executionPoolsView = <Message>(h: HtmlBuilder<Message>, resident: CanonicalProjection,
  agents: readonly AgentScope[] = [], inspect?: (stage: "scheduling" | "effect") => Message) => {
  const preparations = [...resident.dispatch.running].filter(job => job.preparation).sort((a, b) => a.operation - b.operation);
  const requests = [...resident.dispatch.requests].sort((a, b) => a.request - b.request);
  const row = (kind: "preparation" | "jev", label: string, y: number, maximum: number,
    records: readonly { partition: number; description: string }[]) => h.g([
      h.Class(`stage-${kind}-pool`), h.Role(inspect ? "button" : "group"),
      h.AriaLabel(`Inspect shared ${label}: ${records.length} of ${maximum} held`),
      ...(inspect ? [h.Tabindex(0), h.OnClick(inspect(kind === "jev" ? "effect" : "scheduling")), h.OnKeyDownSelfPreventDefault(key => key === "Enter" || key === " " ? Option.some(inspect(kind === "jev" ? "effect" : "scheduling")) : Option.none())] : []),
    ], [
      h.text([h.X("930"), h.Y(String(y)), h.FontSize("12"), h.FontWeight("650"), h.Fill("#263c53")], [label]),
      h.text([h.X("1324"), h.Y(String(y)), h.FontSize("12"), h.FontWeight("750"), h.Fill("#263c53"), h.Class(`stage-${kind}-total`)], [`${records.length} / ${maximum}`]),
      ...Array.from({length:maximum}, (_,index) => {
        const record=records[index]; const owner=record ? ownerLabel(record.partition,agents) : undefined;
        const description=record ? `${owner!.label} · ${record.description}` : `Free ${label.toLowerCase()} position`;
        const x=930+(kind === "jev" ? 20 : 0)+index*43;
        return h.g([h.Class(`stage-${kind}-slot ${record ? "occupied" : "free"}`), h.Role("img"), h.AriaLabel(description)], [
          h.title([], [description]),
          h.rect([h.X(String(x)), h.Y(String(y+11)), h.Width("35"), h.Height("24"), h.Rx("3"), h.Fill(owner?.color ?? "#fff"), h.Stroke(owner?.color ?? "#bdcbdc")], []),
          h.text([h.X(String(x+17.5)), h.Y(String(y+27)), h.TextAnchor("middle"), h.FontSize("10"), h.FontWeight("700"), h.Fill(owner ? "#000000" : "#8797ab")], [owner?.short ?? "–"]),
        ]);
      }),
    ]);
  return h.g([h.Class("resident-execution-pools"), h.AriaLabel("One resident execution pools shared by all agents")], [
    h.rect([h.X("914"),h.Y("562"),h.Width("460"),h.Height("229"),h.Rx("9"),h.Fill("#f7fcfa"),h.Stroke("#168f83"),h.StrokeDasharray("5 4")],[]),
    h.text([h.X("930"),h.Y("586"),h.FontSize("13"),h.FontWeight("750"),h.Fill("#176d65")],["ONE RESIDENT"]),
    h.text([h.X("930"),h.Y("605"),h.FontSize("11"),h.Fill("#62758b")],["Execution limits · shared by all agents"]),
    row("preparation","Preparation workers",632,resident.executionLimits.preparation,preparations.map(job=>({partition:job.partition,description:`preparation operation #${job.operation}`}))),
    row("jev","Jev request permits",695,resident.executionLimits.jevRequests,requests.map(request=>({partition:request.partition,description:`request #${request.request} · ${request.started ? "started" : "authorized, not started"}`}))),
    ...agents.map((agent,index)=>h.text([h.X(String(930+(index%3)*126)),h.Y(String(767+Math.floor(index/3)*15)),h.FontSize("10"),h.FontWeight("600"),h.Fill(AGENT_COLORS[index%AGENT_COLORS.length])],[`A${index+1} · ${agent.agent}`])),
  ]);
};
