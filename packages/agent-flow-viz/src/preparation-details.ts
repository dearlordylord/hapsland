import type { HtmlBuilder } from "foldkit/html";
import { preparationExample } from "../../monkey-business/src/preparation";
import { importReferenceGraph, importTreeBudgetView } from "./import-graph-diagram";
import type { PreparationSnapshot } from "./preparation-mini";
import { recordLabel, type RecordNumbers } from "@hapsland/agent-flow-projection";

/** Reuse the standalone file-graph projection with the selected operation's own trace. */
export const preparationDetails = <Message>(h: HtmlBuilder<Message>, snapshot: PreparationSnapshot, numbers?: RecordNumbers) => {
  const frame = snapshot.frame;
  const frames = snapshot.frames ?? [];
  if (!frame) return h.p([h.Class("preparation-reference-details")], ["No artifact facts have been supplied for this preparation yet."]);
  const generated = frames.find(item => item.event.unit === frame.event.unit && item.event.generatedTree)?.event.generatedTree;
  const example = preparationExample(frame.event.example);
  const targetNames = generated?.targetNames ?? example.targetNames;
  const title = generated ? "Generated import tree" : example.title;
  const count = Math.max(...frames.map(item => item.event.unit)) + 1;
  const units = Array.from({ length: count }, (_, unit) => `Artifact tree ${unit + 1} · ${frames.find(item => item.event.unit === unit && item.event.generatedTree)?.event.generatedTree?.targetNames[1] ?? "A.ts"}`);
  const states = units.map((_, unit) => frames.findLast(item => item.event.unit === unit)?.after ?? frame.before);
  const history = frames.map(item => ({ unit: item.event.unit, event: item.event.fact, command: item.command, state: item.after }));
  const complete = states.filter(state => state.phase === "complete").length;
  const incomplete = states.filter(state => state.phase === "incomplete").length;
  return h.section([h.Class("preparation-reference-details")], [
    h.h4([], [`${recordLabel("preparation", frame.event.operation, numbers)} · ${title}`]),
    h.p([h.Class("preparation-reference-counts")], [`${count} artifact ${count === 1 ? "tree" : "trees"} · ${complete} complete · ${incomplete} incomplete. Selected artifact ${frame.event.unit + 1}: ${frame.after.files}/${frame.after.limits.files} files read · ${frame.after.treeBytes}/${frame.after.limits.treeBytes} accepted evidence-tree bytes · ${frame.after.readBytes} source bytes read.`]),
    ...(generated ? [h.p([h.Class("preparation-generated-counts")], [`${generated.files} generated files · import depth ${generated.depth} · ${frames.filter(item => item.event.unit === frame.event.unit && item.command.kind === "skipImport" && item.command.reason === "Excluded").length} permission denials observed. The graph shows reached files; untouched descendants remain unread.`])] : []),
    ...(generated?.rootEligible === undefined ? [] : [h.p([h.Class("preparation-evidence-eligibility")], [
      `Generated evidence: root-only rules ${generated.rootEligible ? "eligible" : "omitted"}; closure-dependent rules ${generated.closureEligible ? "eligible" : "omitted"}. These actual RulePolicy gates assume consent, enabled matching type-shape rules, source rung 2 and minimum rung 2. Missing closure capabilities affect closure-dependent rules. The separate supplied review-unit offer retains its own admission authority.`,
    ])]),
    h.p([h.Class("preparation-captured-limits")], [`Captured graph limits: source ${frame.after.limits.sourceBytes} B/file · evidence tree ${frame.after.limits.treeBytes} B · files ${frame.after.limits.files} · total read ${frame.after.limits.readBytes} B · outgoing edges ${frame.after.limits.outgoingEdges} · depth ${frame.after.limits.depth} · work ${frame.after.limits.work}.`]),
    h.p([h.Class("preparation-reference-command")], [`${frame.event.fact.kind} → ${frame.command.kind} · ${frame.after.phase}${frame.after.reason ? ` (${frame.after.reason})` : ""}`]),
    h.div([h.Class("chart-scroll import-graph-diagram")], [importReferenceGraph(h, units, targetNames, history, states)]),
    importTreeBudgetView(h, units, targetNames, history, states),
    h.p([], ["This graph uses the selected main replay's history. Source facts are simulated. Evidence-tree byte facts are synthetic accepted contributions, not measured native encoding or a count of complete artifacts. An incomplete graph leaves per-rule evidence eligibility and canonical review-unit admission as separate decisions; the demo supplies its review-unit offer independently."]),
  ]);
};
