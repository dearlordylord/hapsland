import { type SimulationModel } from "./model"

import type { SimulationRun } from "./run-model"
const exportSimulationReplay = (run: SimulationRun, model: SimulationModel) => ({
  ...run.exportReplay(),
  dashboard: { bookmark: model.bookmark }
})
export const replayFileAction = (
  model: SimulationModel,
  action: string,
  run: SimulationRun | undefined,
  fileReadState: { error?: string },
  currentRun: () => SimulationRun | undefined
): SimulationModel | undefined => {
  const exported = () => exportSimulationReplay(run!, model)
  if (action === "download" && run) {
    const link = document.createElement("a")
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported(), null, 2)], { type: "application/json" }))
    link.href = url
    link.download = "hapsland-simulation-replay.json"
    link.click()
    URL.revokeObjectURL(url)
    return { ...model, feedback: "Replay file downloaded." }
  }
  if (action === "import-file") {
    const ownerRun = run
    const ownerLabel = "Resident simulation controls"
    const ownerPanel = document.querySelector(`[aria-label="${ownerLabel}"]`)
    const textarea = ownerPanel?.querySelector<HTMLTextAreaElement>("textarea")
    const ownerReadState = fileReadState
    const stillSelected = () =>
      currentRun() === ownerRun &&
      textarea?.isConnected === true &&
      ownerPanel?.getAttribute("aria-label") === ownerLabel
    const picker = document.createElement("input")
    picker.type = "file"
    picker.accept = ".json,application/json"
    picker.onchange = () => {
      const file = picker.files?.[0]
      if (!file) return
      void file
        .text()
        .then((raw) => {
          if (stillSelected() && textarea) {
            textarea.value = raw
            textarea.dispatchEvent(new Event("input", { bubbles: true }))
          }
        })
        .catch((error) => {
          ownerReadState.error = `Could not read replay file: ${error instanceof Error ? error.message : String(error)}`
        })
    }
    picker.click()
    return { ...model, feedback: "Choose a replay file, then Load replay to validate and reconstruct it." }
  }
}
