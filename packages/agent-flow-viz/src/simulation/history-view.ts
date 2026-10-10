import { projectFlowStep } from "@hapsland/agent-flow-projection"
import type { PLACE_ORDER } from "@hapsland/agent-flow-projection/production-flow-presentation"
import { type SimulationViewContext } from "./context"
import { followsRecord } from "./history-model"

export const simulationHistoryView = <Message>(
  context: Pick<
    SimulationViewContext<Message>,
    "h" | "button" | "model" | "current" | "input" | "observations" | "action"
  >
) => {
  const { h, button, model, current, observations, action } = context
  return [
    h.details(
      [h.Class("simulation-details")],
      [
        h.summary([], ["Checked event, ordered outputs, refusals and synthetic effects"]),
        h.p(
          [],
          [
            current?.event.kind === "stopPolled"
              ? "Agent finish attempt supplied to Hapsland."
              : current?.outputs.some((command) => command.kind.startsWith("finishAllowed"))
                ? "Hapsland allows this agent finish attempt."
                : "Synthetic environment facts and checked product outcomes are shown separately below."
          ]
        ),
        h.pre([h.Tabindex(0)], [current ? JSON.stringify(current, null, 2) : "No checked transition yet."])
      ]
    ),
    h.h3([h.Id("resident-event-history"), h.Tabindex(-1)], ["Recent 100 events"]),
    button(model.filter === "all" ? "Show refusals and delivery problems" : "Show all events", "filter"),
    h.div(
      [h.Class("simulation-history")],
      observations
        .filter((item) => !model.item || followsRecord(item, model.item))
        .filter(
          (item) =>
            !model.focus ||
            model.item ||
            (item.event.kind === "preparationGraph"
              ? model.focus === "preparation"
              : projectFlowStep({
                  event: item.event,
                  outputs: item.outputs,
                  before: item.before,
                  after: item.after,
                  rejection: item.rejection
                }).changedStages.includes(model.focus as (typeof PLACE_ORDER)[number]))
        )
        .filter(
          (item) =>
            model.filter === "all" ||
            item.rejection ||
            item.outputs.some((command) => /Refused$|Denied$|Unavailable$/.test(command.kind)) ||
            (item.event.kind === "submissionTerminal" && !item.event.certain) ||
            (item.event.kind === "finishTerminal" && item.event.outcome === "unknown") ||
            item.event.kind === "submissionRelease" ||
            (item.event.kind === "collectionLeaseCheck" && item.event.expired) ||
            /fail|timeout/i.test(JSON.stringify(item.event))
        )
        .slice(-100)
        .map((item) =>
          h.button(
            [
              h.Type("button"),
              h.Class(item.sequence === current?.sequence ? "selected" : ""),
              h.OnClick(action(`inspect:${item.sequence}`))
            ],
            [
              `${item.sequence}. ${item.time} ms · ${item.agent ?? "resident"} · ${item.event.kind === "preparationGraph" ? `preparation · ${item.event.fact.kind} · operation #${item.event.operation}` : item.event.kind}${item.rejection ? ` · refusal: ${item.rejection}` : ""}`
            ]
          )
        )
    ),
    h.label(
      [],
      [
        "Retained event timeline",
        h.input([
          h.Type("range"),
          h.AriaLabel("Retained event timeline"),
          h.Min(String(observations[0]?.sequence ?? 0)),
          h.Max(String(observations.at(-1)?.sequence ?? 0)),
          // The native thumb owns an in-flight gesture; queued playback renders
          // may update the default without replaying an older value over the drag.
          // Explicit controls replace the node to synchronize historical navigation.
          h.Key(`timeline:${model.draftEpoch}:${model.timelineEpoch}`),
          { _tag: "Prop", key: "defaultValue", value: String(current?.sequence ?? 0) },
          h.OnInput((raw) => action(`scrub:${raw}`))
        ])
      ]
    )
  ]
}
