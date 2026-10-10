import {
  type Control,
  type Observation,
  DEFAULT_FILE_TREE_PROFILE,
  type FileTreeProfile,
  JEV_OUTCOME_ORDER
} from "@hapsland/monkey-business"
import { numberRecords } from "@hapsland/agent-flow-projection"
import type { HtmlBuilder } from "foldkit/html"
import type { ReplayStep } from "../canonical-replay"
import type { simulationRenderSnapshot } from "./controller"
import { type SimulationModel } from "./model"
import { rawWeights, mixSummary } from "./outcome-mix"
import { treeProfile, treeFields, treeSummary } from "./file-trees"

export const simulationPresentation = <Message>(
  snapshot: ReturnType<typeof simulationRenderSnapshot>,
  model: SimulationModel,
  h: HtmlBuilder<Message>,
  action: (action: string) => Message,
  changed: (field: string, raw: string) => Message,
  showDiagram = true,
  inspection?: {
    readonly projection: import("@hapsland/canonical-policy/canonical/adapter").CanonicalProjection
    readonly observations: readonly Observation[]
    readonly partition?: number
    readonly numbers?: import("@hapsland/agent-flow-projection").RecordNumbers
    readonly agents?: readonly import("../shared-resident-view").AgentScope[]
  }
) => {
  const { run, totals, replaying } = snapshot
  // Native dirty inputs own their visible draft. A controlled Value would replay older
  // queued models into the focused field; only explicit draft replacement changes its key.
  const input = (field: string, label: string, value: string) =>
    h.label(
      [],
      [
        label,
        h.input([
          h.Type("text"),
          h.Key(`draft:${field}:${model.draftEpoch}`),
          h.Attribute("value", value),
          h.OnInput((raw) => changed(field, raw))
        ])
      ]
    )
  const button = (label: string, name: string) => h.button([h.Type("button"), h.OnClick(action(name))], [label])
  const submit = (label: string) => h.button([h.Type("submit")], [label])
  const controlForm = (name: string, children: Parameters<typeof h.form>[1]) =>
    h.form([h.Class("simulation-controls"), h.OnSubmit(action(name))], children)
  const select = (field: string, label: string, value: string, choices: readonly string[]) =>
    h.label(
      [],
      [
        label,
        h.select(
          [h.AriaLabel(label), h.Value(value), h.OnChange((raw) => changed(field, raw))],
          choices.map((choice) => h.option([h.Value(choice)], [choice]))
        )
      ]
    )
  const weights = rawWeights(model)
  const weightTotal = JEV_OUTCOME_ORDER.reduce((total, outcome) => total + weights[outcome], 0)
  let draftMix = "Choose at least one nonzero weight."
  try {
    draftMix = mixSummary(weights)
  } catch {
    /* Invalid drafts are previewed without touching the engine. */
  }
  const observed = run?.observe()
  const observations = observed?.observations ?? []
  const activeReplay = run?.appliedSettings
  const latestControl = <Kind extends Control["kind"]>(kind: Kind) =>
    activeReplay?.controls
      .map((entry) => entry.control)
      .findLast(
        (control): control is Extract<Control, { kind: Kind }> =>
          control.kind === kind && (!control.agent || control.agent === model.agentId)
      )
  const activeTrees = activeReplay
    ? (latestControl("fileTrees")?.profile ?? activeReplay.config.fileTrees ?? DEFAULT_FILE_TREE_PROFILE)
    : undefined
  let treeDraftStatus: string
  try {
    const draft = treeProfile(model)
    const unapplied =
      activeTrees &&
      (Object.keys(treeFields) as (keyof FileTreeProfile)[]).some((key) => draft[key] !== activeTrees[key])
    treeDraftStatus = `Draft: ${treeSummary(draft)} · source ${draft.minSourceBytes}–${draft.maxSourceBytes} B/file · evidence ${draft.minTreeBytes}–${draft.maxTreeBytes} B/file.${unapplied ? " Unapplied changes." : ""}`
  } catch (error) {
    treeDraftStatus = `Cannot apply: ${error instanceof Error ? error.message : String(error)}`
  }
  const treeInput = (
    field: (typeof treeFields)[keyof typeof treeFields],
    label: string,
    min: number,
    max: number,
    shortLabel = label
  ) =>
    h.label(
      [],
      [
        shortLabel,
        h.input([
          h.Type("number"),
          h.AriaLabel(label),
          h.Min(String(min)),
          h.Max(String(max)),
          h.Step("1"),
          h.Key(`draft:${field}:${model.draftEpoch}`),
          h.Attribute("value", model[field]),
          h.OnInput((raw) => changed(field, raw))
        ])
      ]
    )
  const current =
    model.selected < 0 ? observations.at(-1) : observations.find((item) => item.sequence === model.selected)
  const candidate = current?.capacityMetadata.encodedOutput
  const availableGroups = current
    ? Array.from(
        new Set([
          ...current.after.delivery.slots.map((s) => s.group),
          ...current.after.delivery.counters.map((c) => c.group),
          ...current.after.collection.claims.map((c) => c.group),
          ...(current.capacityMetadata.deliveryGroups ?? []).map((binding) => binding.group)
        ])
      )
    : []
  const availableRounds = (inspection?.projection ?? current?.after)?.rounds ?? []
  const selectedGroup =
    availableGroups.includes(Number(model.resourceGroup)) && model.resourceGroup !== "" ? model.resourceGroup : ""
  const selectedRound = availableRounds.some((round) => String(round.id) === model.resourceRound)
    ? model.resourceRound
    : ""
  // A clipped observation history cannot establish the first ordinal of each kind.
  const numbers =
    inspection?.numbers ??
    numberRecords(
      observations[0]?.sequence === 0 ? observations.filter((item) => item.sequence <= (current?.sequence ?? -1)) : []
    )
  const last: ReplayStep | undefined = current
    ? {
        event: current.event,
        outputs: current.outputs,
        before: current.before,
        after: current.after,
        rejection: current.rejection,
        origin: "manual",
        preparation: current.preparation
      }
    : undefined
  return {
    run,
    totals,
    replaying,
    input,
    button,
    submit,
    controlForm,
    select,
    weights,
    weightTotal,
    draftMix,
    observed,
    observations,
    activeReplay,
    latestControl,
    activeTrees,
    treeDraftStatus,
    treeInput,
    current,
    candidate,
    availableGroups,
    availableRounds,
    selectedGroup,
    selectedRound,
    numbers,
    last
  }
}
