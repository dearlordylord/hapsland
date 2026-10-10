import { recordLabel } from "@hapsland/agent-flow-projection"
import { SQUARES } from "@hapsland/agent-flow-projection/production-flow-presentation"
import { type ProductionFlowContext } from "./context"

export const flowStepDetails = <Message>(
  context: Pick<
    ProductionFlowContext<Message>,
    | "h"
    | "last"
    | "event"
    | "preparation"
    | "numbers"
    | "outputs"
    | "showcase"
    | "sourceCompletion"
    | "sourceLabel"
    | "completionContext"
    | "flow"
    | "changedStages"
    | "unmapped"
  >
) => {
  const { h, last, numbers, outputs, showcase, sourceCompletion, sourceLabel, completionContext, flow, unmapped } =
    context
  return h.details(
    [h.Class("topology-step")],
    [
      h.summary([], ["Decision details"]),
      h.p(
        [],
        [
          last === undefined
            ? "Choose a guided or manual event."
            : last.rejection !== undefined
              ? `${last.event.kind} rejected: ${last.rejection}. Bend state and item locations did not change.`
              : last.preparation
                ? `ImportGraph: ${last.preparation.event.fact.kind} → ${last.preparation.command.kind} · ${recordLabel("preparation", last.preparation.event.operation, numbers)}`
                : `${last.event.kind} accepted · ${outputs.length} output(s): ${outputs.map((command) => command.kind).join(", ") || "none"}`
        ]
      ),
      ...(showcase && last?.origin === "guided" && last.event.kind === "issuePermit"
        ? [
            h.p(
              [h.Class("flow-provenance")],
              [
                "Before the edit: a source-free pre-edit request supplies its timing and identity facts. Bend issued a permit. No virtual round is open yet."
              ]
            )
          ]
        : []),
      ...(showcase && last?.origin === "guided" && last.event.kind === "consumePermit"
        ? [
            h.p(
              [h.Class("flow-provenance")],
              [
                outputs.some((command) => command.kind === "roundStarted")
                  ? "Why this round opened: the first accepted attributed edit consumed its permit. Bend opened virtual round #1 in that same transition."
                  : "This accepted attributed edit consumed its permit and joined the already open virtual round."
              ]
            )
          ]
        : []),
      ...(last?.event.kind === "openRound"
        ? [
            h.p(
              [h.Class("flow-provenance")],
              [
                last.origin === "manual"
                  ? "You supplied this openRound event in the replay."
                  : "This guided fixture supplies openRound directly. Its native trigger is not represented in the replay."
              ]
            )
          ]
        : []),
      ...(sourceCompletion === undefined
        ? []
        : [h.p([h.Class("flow-provenance")], [`${sourceLabel} completed. ${completionContext}.`])]),
      h.p(
        [],
        [
          last === undefined
            ? "Choose a reducer event to inspect its checked effects."
            : last?.preparation
              ? `Inner preparation: ${last.preparation.event.fact.kind} → ${last.preparation.command.kind}. Canonical work and capacity stay at preparation.`
              : flow.rejection !== undefined
                ? `Rejected: ${flow.rejection}. No movement is shown.`
                : flow.evidence.length
                  ? `${flow.evidence.length} relation(s) have checked evidence.`
                  : flow.changedStages.length
                    ? `State changed in ${flow.changedStages.map((stage) => SQUARES[stage].title).join(", ")}; no item crossed a displayed connection.`
                    : flow.projectionChanged
                      ? "Checked reducer state changed outside the displayed square details; no displayed movement is established."
                      : outputs.length
                        ? `Decision emitted ${outputs.map((command) => command.kind).join(", ")}; no displayed item movement is established.`
                        : "Accepted event; no displayed item movement or square change is established."
        ]
      ),
      ...(unmapped.length
        ? [
            h.p(
              [h.Class("topology-unmapped-relations")],
              [
                `Checked relations outside drawn connections: ${unmapped.map((item) => `${SQUARES[item.from].title} → ${SQUARES[item.to].title}: ${item.description}`).join("; ")}.`
              ]
            )
          ]
        : []),
      h.p(
        [],
        [
          `Branches at this step: ${
            outputs
              .filter((command) =>
                /Refused|Unavailable|Interrupted|Ignored|Stale|Cancel|Clear|Finding|Waiting|Allowed|Expired|Lease|Reoffer|Unknown|Recorded|Terminal/.test(
                  command.kind
                )
              )
              .map((command) => command.kind)
              .join(", ") || "none"
          }.`
        ]
      )
    ]
  )
}
