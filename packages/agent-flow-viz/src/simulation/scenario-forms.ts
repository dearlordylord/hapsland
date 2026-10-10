import { FILE_TREE_LABELS } from "@hapsland/monkey-business"
import { type SimulationViewContext } from "./context"

export const editDurationSettingsForm = <Message>(
  context: Pick<SimulationViewContext<Message>, "controlForm" | "h" | "input" | "model" | "changed" | "submit">
) => {
  const { controlForm, h, model, changed, submit } = context
  return controlForm("editDuration", [
    h.label(
      [],
      [
        "Simulated edit duration (virtual ms)",
        h.input([
          h.Type("number"),
          h.AriaLabel("Simulated edit duration (virtual ms)"),
          h.Min("0"),
          h.Max("1000000000"),
          h.Step("1"),
          h.Key(`edit-duration:${model.draftEpoch}`),
          h.Attribute("value", model.editDuration),
          h.OnInput((raw) => changed("editDuration", raw))
        ])
      ]
    ),
    submit("Apply edit duration")
  ])
}
export const startSettingsForm = <Message>(
  context: Pick<
    SimulationViewContext<Message>,
    "controlForm" | "input" | "model" | "h" | "select" | "changed" | "submit"
  >
) => {
  const { controlForm, input, model, h, changed, submit } = context
  return controlForm("start", [
    input("seed", "Seed", model.seed),
    input("variation", "Edit interval variation (virtual ms)", model.variation),
    input("editsPerTask", "Edits per task", model.editsPerTask),
    input("taskPause", "Pause between tasks (virtual ms)", model.taskPause),
    h.label(
      [],
      [
        "Advice response",
        h.select(
          [
            h.AriaLabel("Advice response"),
            h.Value(model.adviceResponse),
            h.OnChange((raw) => changed("adviceResponse", raw))
          ],
          [
            h.option([h.Value("ignore")], ["Ignore advice"]),
            h.option([h.Value("noAction")], ["Record no action"]),
            h.option([h.Value("promptRepair")], ["Prompt repair"]),
            h.option([h.Value("delayedRepair")], ["Delayed repair"])
          ]
        )
      ]
    ),
    input("repairDelay", "Repair response delay (virtual ms)", model.repairDelay),
    submit("Start / reset")
  ])
}
export const fileTreesSettingsForm = <Message>(
  context: Pick<SimulationViewContext<Message>, "controlForm" | "h" | "treeInput" | "submit">
) => {
  const { controlForm, h, treeInput, submit } = context
  return controlForm("fileTrees", [
    h.fieldset(
      [h.Class("simulation-tree-range")],
      [
        h.legend([], ["Generated files per artifact"]),
        treeInput("treeMinFiles", "Generated files per artifact · minimum", 1, 64, "Minimum"),
        treeInput("treeMaxFiles", "Generated files per artifact · maximum", 1, 64, "Maximum")
      ]
    ),
    treeInput("treeMaxImports", "Maximum imports per file", 0, 16),
    treeInput("treeMaxDepth", "Maximum import depth", 0, 12),
    treeInput("treeDeniedPercent", "Denied import targets (%)", 0, 100),
    treeInput("treeMissingPercent", FILE_TREE_LABELS.missingPercent, 0, 100),
    treeInput("treeUnsupportedPercent", FILE_TREE_LABELS.unsupportedPercent, 0, 100),
    treeInput("treeUnreadablePercent", FILE_TREE_LABELS.unreadablePercent, 0, 100),
    treeInput("treeRepeatedPercent", FILE_TREE_LABELS.repeatedEdgePercent, 0, 100),
    treeInput("treeCyclicPercent", FILE_TREE_LABELS.cyclicEdgePercent, 0, 100),
    treeInput("treeDeadlineStep", FILE_TREE_LABELS.deadlineStep, 0, 511),
    treeInput("treeLocalWork", FILE_TREE_LABELS.localWork, 0, 1048576),

    h.fieldset(
      [h.Class("simulation-tree-range")],
      [
        h.legend([], ["Source bytes per file"]),
        treeInput("treeMinSourceBytes", "Source bytes per file · minimum", 1, 1048576, "Minimum"),
        treeInput("treeMaxSourceBytes", "Source bytes per file · maximum", 1, 1048576, "Maximum")
      ]
    ),
    h.fieldset(
      [h.Class("simulation-tree-range")],
      [
        h.legend([], ["Evidence-tree bytes per file"]),
        treeInput("treeMinTreeBytes", "Evidence-tree bytes per file · minimum", 1, 1048576, "Minimum"),
        treeInput("treeMaxTreeBytes", "Evidence-tree bytes per file · maximum", 1, 1048576, "Maximum")
      ]
    ),
    submit("Apply to future preparations")
  ])
}
