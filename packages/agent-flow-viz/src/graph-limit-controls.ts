import type { HtmlBuilder } from "foldkit/html";
import { GRAPH_LIMIT_CEILINGS, graphLimitFields, validateGraphLimits, type GraphLimits, type GraphLimitField } from "../../../src/configuration/graph-limits.ts";

export const GRAPH_LIMIT_LABELS: Readonly<Record<GraphLimitField, string>> = {
  sourceBytes: "Maximum source bytes per file", treeBytes: "Maximum accepted evidence-tree bytes",
  files: "Maximum files read", readBytes: "Maximum total source bytes read",
  outgoingEdges: "Maximum outgoing edges per file", depth: "Maximum supporting-reference depth",
  work: "Maximum graph work steps",
};
export type GraphLimitDrafts = Readonly<Record<GraphLimitField, string>>;
export const graphLimitDrafts = (limits: GraphLimits = GRAPH_LIMIT_CEILINGS): GraphLimitDrafts => ({
  sourceBytes: String(limits.sourceBytes), treeBytes: String(limits.treeBytes), files: String(limits.files),
  readBytes: String(limits.readBytes), outgoingEdges: String(limits.outgoingEdges), depth: String(limits.depth), work: String(limits.work),
});
export const graphLimitsFromDrafts = (drafts: GraphLimitDrafts): GraphLimits => validateGraphLimits({
  version: 1, sourceBytes: Number(drafts.sourceBytes), treeBytes: Number(drafts.treeBytes),
  files: Number(drafts.files), readBytes: Number(drafts.readBytes), outgoingEdges: Number(drafts.outgoingEdges),
  depth: Number(drafts.depth), work: Number(drafts.work),
});
/** Only production-configurable fields; new profiles apply to future units. */
export const graphLimitControls = <Message>(h: HtmlBuilder<Message>, drafts: GraphLimitDrafts,
  changed: (field: GraphLimitField, value: string) => Message) => h.div([h.Class("graph-limit-controls")], [
  h.p([], ["Graph limits apply when a new review unit captures configuration. In-flight units keep their original profile. Total read bytes must be at least the per-file source limit."]),
  ...graphLimitFields.map(field => h.label([], [GRAPH_LIMIT_LABELS[field], h.input([
    h.Type("number"), h.Min("1"), h.Max(String(GRAPH_LIMIT_CEILINGS[field])), h.Step("1"),
    h.AriaLabel(GRAPH_LIMIT_LABELS[field]), h.Value(drafts[field]), h.OnInput(value => changed(field, value)),
  ])])),
]);
