import { stageResourceDetails } from "../resource-details"
import { preparationDetails } from "../preparation-details"
import { preparationSnapshot } from "../preparation-mini"
import { locateFlow } from "@hapsland/agent-flow-projection"
import { SQUARES, PLACE_ORDER } from "@hapsland/agent-flow-projection/production-flow-presentation"
import { type SimulationViewContext } from "./context"

import { recordIdentity } from "./history-model"

export const simulationInspectionView = <Message>(
  context: Pick<
    SimulationViewContext<Message>,
    | "h"
    | "model"
    | "select"
    | "changed"
    | "button"
    | "current"
    | "inspection"
    | "numbers"
    | "selectedGroup"
    | "availableGroups"
    | "selectedRound"
    | "availableRounds"
    | "candidate"
    | "run"
    | "observations"
  >
) => {
  const {
    h,
    model,
    changed,
    button,
    current,
    inspection,
    numbers,
    selectedGroup,
    availableGroups,
    selectedRound,
    availableRounds,
    candidate,
    run,
    observations
  } = context
  return h.div(
    [
      h.Id("resident-stage-inspector"),
      h.Tabindex(-1),
      h.Class(
        `simulation-stage-inspector${model.focus ? " capacity-selected" : ""}${model.focus === "preparation" ? " preparation-selected" : ""}`
      )
    ],
    [
      h.details(
        [h.Open(true)],
        [
          h.summary([], ["Inspect a diagram stage by keyboard"]),
          h.select(
            [h.AriaLabel("Diagram stage"), h.Value(model.stage), h.OnChange((raw) => changed("stage", raw))],
            PLACE_ORDER.map((place) => h.option([h.Value(place)], [SQUARES[place].title]))
          ),
          button("Inspect selected stage", "focus-stage")
        ]
      ),
      ...(model.focus ? [button("Clear lifecycle filter", "focus:")] : []),
      ...(model.focus && current
        ? [
            h.details(
              [h.Open(true)],
              [
                h.summary([], [`Focused lifecycle and state: ${SQUARES[model.focus as keyof typeof SQUARES]?.title}`]),
                h.p(
                  [],
                  [
                    SQUARES[model.focus as keyof typeof SQUARES]?.detail(
                      inspection?.projection ?? current.after,
                      numbers
                    ) ?? ""
                  ]
                ),
                ...(["delivery", "round"].includes(model.focus)
                  ? [
                      h.label(
                        [],
                        [
                          "Delivery group",
                          h.select(
                            [
                              h.AriaLabel("Resource delivery group"),
                              h.Value(selectedGroup),
                              h.OnChange((raw) => changed("resourceGroup", raw))
                            ],
                            [
                              h.option([h.Value("")], ["Select group"]),
                              ...availableGroups.map((group) => h.option([h.Value(String(group))], [`Group ${group}`]))
                            ]
                          )
                        ]
                      )
                    ]
                  : []),
                ...(["round"].includes(model.focus)
                  ? [
                      h.label(
                        [],
                        [
                          "Current round",
                          h.select(
                            [
                              h.AriaLabel("Resource current round"),
                              h.Value(selectedRound),
                              h.OnChange((raw) => changed("resourceRound", raw))
                            ],
                            [
                              h.option([h.Value("")], ["Select round"]),
                              ...availableRounds.map((round) =>
                                h.option(
                                  [h.Value(String(round.id))],
                                  [`Partition ${round.partition} · round ${round.id}`]
                                )
                              )
                            ]
                          )
                        ]
                      )
                    ]
                  : []),
                stageResourceDetails(
                  h,
                  model.focus,
                  inspection?.projection ?? current.after,
                  current.after,
                  current.capacityMetadata,
                  candidate,
                  inspection?.partition ?? run?.agentScopes.find((a) => a.agent === model.agentId)?.partition,
                  selectedGroup === "" ? undefined : Number(selectedGroup),
                  selectedRound === "" ? undefined : Number(selectedRound),
                  inspection?.agents ?? run?.agentScopes
                ),
                ...(model.focus === "preparation"
                  ? [
                      preparationDetails(
                        h,
                        preparationSnapshot(
                          (inspection?.observations ?? observations)
                            .filter((frame) => frame.sequence <= current.sequence)
                            .map((frame) => ({ ...frame, origin: "manual" as const }))
                        ),
                        numbers
                      )
                    ]
                  : []),
                h.ul(
                  [],
                  locateFlow(inspection?.projection ?? current.after, numbers)
                    .filter(
                      (record) =>
                        record.stage === model.focus || (model.focus === "jev" && record.key.startsWith("request:"))
                    )
                    .map((record) => h.li([], [button(record.description, `item:${recordIdentity(record.key)}`)]))
                ),
                h.p(
                  [],
                  [
                    model.item
                      ? `Following ${model.item}; history is filtered to this identity.`
                      : "Select a record to follow its lifecycle."
                  ]
                )
              ]
            )
          ]
        : [])
    ]
  )
}
