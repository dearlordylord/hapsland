import { type SimulationViewContext } from "./context"
import { fileTreesSettingsForm } from "./scenario-forms"
import { treeSummary } from "./file-trees"

export const fileTreesSettings = <Message>(
  context: Pick<
    SimulationViewContext<Message>,
    "h" | "button" | "controlForm" | "treeInput" | "submit" | "treeDraftStatus" | "activeTrees"
  >
) => {
  const { h, button, treeDraftStatus, activeTrees } = context
  return h.details(
    [h.Class("simulation-file-trees")],
    [
      h.summary([], ["Generated import trees"]),
      h.p(
        [],
        [
          "File counts include the allowed root. Import depth starts at 0. Permissions are sampled per imported file; the seed reproduces each artifact's tree."
        ]
      ),
      h.div(
        [h.Class("simulation-controls")],
        [button("Balanced trees", "trees:balanced"), button("Tree budget pressure", "trees:pressure")]
      ),
      fileTreesSettingsForm(context),
      h.p([h.Class("simulation-tree-draft")], [treeDraftStatus]),
      h.p(
        [h.Class("simulation-tree-active")],
        [
          activeTrees
            ? `Applied to new preparations: ${treeSummary(activeTrees)} · source ${activeTrees.minSourceBytes}–${activeTrees.maxSourceBytes} B/file · evidence ${activeTrees.minTreeBytes}–${activeTrees.maxTreeBytes} B/file.`
            : "Start / reset applies the draft generation settings."
        ]
      ),
      h.p(
        [],
        [
          "Changes apply when a preparation starts. In-flight trees stay fixed. Graph limits above use production validation. Generated facts may exceed the captured limits. Reservation bytes are a separate review admission fact."
        ]
      )
    ]
  )
}
