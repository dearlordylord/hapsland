import { applySimulationControl } from "./controls"
import { draftSimulationPreset } from "./scenario-presets"
import { replayFileAction } from "./replay-files"
import { navigateSimulation } from "./navigation"
import { createSimulationRun } from "./start-run"
import { replaySimulationDrafts } from "./replay-drafts"

import { graphLimitsFromDrafts } from "../graph-limit-controls"
import {
  type createRun,
  restoreReplay,
  replayRun,
  type Replay,
  type Control,
  type Observation
} from "@hapsland/monkey-business"
import { type SimulationModel } from "./model"
import { treeProfile, graphDrafts } from "./file-trees"
import { number, speedValue, InputError } from "./input"

import { environmentFacts, outputProfile } from "./environment"

export let run: ReturnType<typeof createRun> | undefined
let wallBudget = 0
let fileReadState: { error?: string } = {}
let replayEndpoint: Replay["endpoint"] | undefined
export let replaySource: Replay | undefined
const completeReplay = () => {
  if (run && replaySource && run.eventCount >= replaySource.endpoint.eventCount) {
    totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0, uncertain: 0, released: 0 }
    run = restoreReplay(replaySource, countFrame)
    fileReadState = {}
    replayEndpoint = undefined
    replaySource = undefined
    return true
  }
  return false
}
let totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0, uncertain: 0, released: 0 }
const currentTotals = () => totals
const countFrame = (item: Observation) => {
  totals.checked++
  totals.admitted += item.outputs.filter((command) => command.kind === "observationAdmitted").length
  totals.refused += item.rejection
    ? 1
    : item.outputs.filter((command) => /Refused$|Denied$|Unavailable$/.test(command.kind)).length
  if (/fail|timeout/i.test(JSON.stringify(item.event))) totals.failed++
  if (
    item.event.kind === "submissionTerminal" &&
    item.outputs.some((command) => command.kind === "submissionRecorded")
  ) {
    if (item.event.certain) totals.advice++
    else totals.uncertain++
  }
  if (item.event.kind === "finishTerminal" && item.outputs.some((command) => command.kind === "finishRecorded")) {
    const token = item.event.token
    const changed = item.after.delivery.submissions.batches.filter(
      (batch) =>
        batch.token === token &&
        item.before.delivery.submissions.batches.some(
          (prior) => prior.advice === batch.advice && prior.token === batch.token && prior.phase !== batch.phase
        )
    ).length
    if (item.event.outcome === "acknowledged") totals.advice += changed
    else if (item.event.outcome === "unknown") totals.uncertain += changed
  }
  totals.released += item.outputs.filter((command) => command.kind === "submissionReleased").length
}
const actSimulationNow = (model: SimulationModel, action: string): SimulationModel => {
  model = { ...model, activityFrom: -1 }
  try {
    const exported = () => ({ ...run!.exportReplay(), dashboard: { bookmark: model.bookmark } })
    if (action === "replay-start" && run) {
      const inputs = run.exportReplay()
      run = replayRun(inputs)
      fileReadState = {}
      totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0, uncertain: 0, released: 0 }
      run.subscribe(countFrame)
      replayEndpoint = inputs.endpoint
      replaySource = inputs
      wallBudget = 0
      return {
        ...model,
        selected: -1,
        playing: false,
        suspended: false,
        revision: model.revision + 1,
        feedback: "Replay reset to initial inputs. Resume or Single step to replay recorded controls to its endpoint."
      }
    }
    const preset = draftSimulationPreset(model, action)
    if (preset) return preset
    const navigated = navigateSimulation(model, action, run)
    if (navigated) return navigated

    const fileAction = replayFileAction(model, action, run, fileReadState, () => run)
    if (fileAction) return fileAction
    if (
      (replaySource &&
        [
          "pace",
          "editDuration",
          "burst",
          "suspend",
          "sizes",
          "environment",
          "output",
          "fileTrees",
          "graphLimits"
        ].includes(action)) ||
      (replaySource && (action.startsWith("credentials:") || action.startsWith("jev-request:")))
    ) {
      return {
        ...model,
        feedback:
          "Cannot apply: finish recorded replay before applying new environment controls. Draft fields remain editable."
      }
    }
    const controlled = applySimulationControl(model, action, run, replaySource !== undefined)
    if (controlled) return controlled

    let feedback = model.feedback
    let playing = model.playing
    let suspended = model.suspended
    let replay = model.replay
    let selected = model.selected
    let loadedFields: Partial<SimulationModel> = {}
    if (action === "start") {
      const validSpeed = speedValue(model.speed)
      run = createSimulationRun(model)
      fileReadState = {}
      replayEndpoint = undefined
      replaySource = undefined
      totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0, uncertain: 0, released: 0 }
      run.subscribe(countFrame)
      loadedFields = { appliedSpeed: validSpeed, bookmark: -1, draftEpoch: model.draftEpoch + 1 }
      playing = false
      suspended = false
      wallBudget = 0
      selected = -1
      feedback = "Seeded session started. Paused playback; edit generation is enabled."
    } else if (action === "load") {
      const inputs: Replay = JSON.parse(model.replay)
      number(String(inputs.endpoint.eventCount), "Replay endpoint events", 0, 100_000)
      number(String(inputs.endpoint.now), "Replay endpoint time", 0, Number.MAX_SAFE_INTEGER)
      const previousTotals = totals
      totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0, uncertain: 0, released: 0 }
      let restored
      try {
        restored = restoreReplay(inputs, countFrame)
        number(
          String(Math.max(1, restored.agentScopes.length, restored.projection.partitions.length)),
          "Replay agent count",
          1,
          6
        )
      } catch (error) {
        totals = previousTotals
        throw error
      }
      run = restored
      fileReadState = {}
      replayEndpoint = undefined
      replaySource = undefined
      playing = false
      selected = -1
      const replayDrafts = replaySimulationDrafts(model, inputs, restored)
      suspended = replayDrafts.suspended
      loadedFields = replayDrafts.fields
      wallBudget = 0
      feedback = "Replay reconstructed from initial inputs and recorded controls. Paused at the recorded endpoint."
    } else {
      if (!run) throw new Error("Start or load a run first.")
      switch (action) {
        case "step": {
          playing = false
          const observation = replayEndpoint && run.eventCount >= replayEndpoint.eventCount ? undefined : run.step()
          const completed = completeReplay()
          feedback = completed
            ? "Replay reached its exact recorded endpoint."
            : observation
              ? "One checked transition advanced."
              : "No pending synthetic events. Change controls or reset to continue."
          selected = -1
          break
        }
        case "play":
          selected = -1
          playing = !playing
          wallBudget = 0
          feedback = playing ? "Playback running." : "Playback paused. Future edit generation is unchanged."
          break
        case "pace":
          run.applyControl({
            kind: "editPace",
            agent: model.agentId,
            intervalMs: number(model.pace, "Edit pace", 1, 1_000_000)
          })
          feedback = "Future edit pace updated at this virtual boundary."
          break
        case "editDuration":
          run.applyControl({
            kind: "editDuration",
            agent: model.agentId,
            durationMs: number(model.editDuration, "Simulated edit duration", 0, 1_000_000_000)
          })
          feedback =
            "Future simulated PRE-to-POST duration updated for the selected agent. In-progress edits keep their timing."
          break
        case "burst":
          run.applyControl({ kind: "burst", agent: model.agentId, count: number(model.burst, "Burst count", 1, 100) })
          feedback = "Bounded edit burst recorded."
          break
        case "environment":
          run.applyControl({ kind: "environment", ...environmentFacts(model) })
          feedback =
            "Environment facts applied. Pending requests recheck freshness at settlement; new checks use the current credential fact."
          break
        case "output":
          run.applyControl({ kind: "outputProfile", ...outputProfile(model) })
          feedback =
            "Host output profile applied for future authorizations. Already authorized output keeps its captured delay, lease and outcome."
          break
        case "suspend":
          suspended = !suspended
          run.applyControl({ kind: "suspendArrivals", suspended, agent: model.agentId })
          feedback = suspended
            ? "Future edits suspended. Existing synthetic work continues; playback will wait when settled."
            : "Future edit generation resumed."
          break
        case "graphLimits":
          run.applyControl({ kind: "graphLimits", limits: graphLimitsFromDrafts(graphDrafts(model)) })
          feedback = "Production graph limits applied to new units; in-flight units retain captured configuration."
          break
        case "fileTrees":
          run.applyControl({ kind: "fileTrees", profile: treeProfile(model) })
          feedback = "Tree generation applied to future preparations. In-flight trees keep their captured facts."
          break
        case "sizes":
          run.applyControl({
            kind: "sizes",
            agent: model.agentId,
            reservationBytes: number(model.bytes, "Reservation bytes", 1, 1_000_000),
            reviewUnitBytes: [number(model.bytes, "Reservation bytes", 1, 1_000_000)]
          })
          feedback = "Synthetic reservation facts updated for future edits."
          break
        case "export":
          replay = JSON.stringify(exported(), null, 2)
          feedback = "Replay inputs exported below; copy JSON to a fresh dashboard run."
          break
        default:
          if (action.startsWith("inspect:") || action.startsWith("scrub:")) {
            selected = Number(action.slice(action.indexOf(":") + 1))
            playing = false
          }
          if (["previous", "next", "latest", "from-start", "go-bookmark"].includes(action)) {
            const items = run.observations
            const index = selected < 0 ? items.length - 1 : items.findIndex((item) => item.sequence === selected)
            selected =
              action === "latest"
                ? -1
                : action === "from-start"
                  ? (items[0]?.sequence ?? -1)
                  : action === "go-bookmark"
                    ? model.bookmark
                    : (items[Math.max(0, Math.min(items.length - 1, index + (action === "previous" ? -1 : 1)))]
                        ?.sequence ?? -1)
            playing = false
          }
      }
    }
    return {
      ...model,
      ...loadedFields,
      playing,
      suspended:
        run?.appliedSettings.controls.findLast(
          (entry) =>
            entry.control.kind === "suspendArrivals" && (!entry.control.agent || entry.control.agent === model.agentId)
        )?.control.kind === "suspendArrivals"
          ? (
              run.appliedSettings.controls.findLast(
                (entry) =>
                  entry.control.kind === "suspendArrivals" &&
                  (!entry.control.agent || entry.control.agent === model.agentId)
              )!.control as Extract<Control, { kind: "suspendArrivals" }>
            ).suspended
          : suspended,
      replay,
      selected,
      timelineEpoch: action.startsWith("scrub:") ? model.timelineEpoch : model.timelineEpoch + 1,
      feedback,
      revision: model.revision + 1
    }
  } catch (error) {
    return {
      ...model,
      playing: error instanceof InputError || ["load", "start"].includes(action) ? model.playing : false,
      feedback: `Cannot apply:  ${error instanceof Error ? error.message : String(error)}`,
      revision: model.revision + 1
    }
  }
}
type AdvanceResult = ReturnType<NonNullable<typeof run>["advance"]>
type PublishedRun = Pick<
  NonNullable<typeof run>,
  | "now"
  | "eventCount"
  | "projection"
  | "observations"
  | "agentScopes"
  | "appliedSettings"
  | "capacityMetadata"
  | "editPermitLimits"
  | "futurePermitProfile"
  | "interventions"
  | "observe"
>
let publishedRun: PublishedRun | undefined
let publishedTotals = { ...totals }
let advanceGeneration = 0
type PendingAdvanceStatus =
  | { state: "running" }
  | { state: "result"; result: AdvanceResult }
  | { state: "error"; error: unknown }
type PendingAdvance = {
  iterator: Generator<void, AdvanceResult>
  beforeTime: number
  activityFrom: number
  generation: number
  scheduled: boolean
  status: PendingAdvanceStatus
  runner?: Promise<void>
}
let pendingAdvance: PendingAdvance | undefined
const capturePublishedRun = () => {
  if (!run) return
  const observed = run.observe()
  publishedTotals = { ...totals }
  publishedRun = {
    ...observed,
    appliedSettings: run.appliedSettings,
    editPermitLimits: run.editPermitLimits,
    futurePermitProfile: run.futurePermitProfile,
    observe: () => observed
  }
}
/** The renderer sees a complete boundary while the actual Run advances privately. */
export const simulationReadRun = (): PublishedRun | undefined => (pendingAdvance ? publishedRun : run)
const completedAdvance = (
  model: SimulationModel,
  batch: NonNullable<typeof pendingAdvance>,
  result: AdvanceResult
): SimulationModel => {
  if (!run) return model
  // Empty windows leave the virtual clock at the last event. Carry that
  // budget forward; an event-limited batch also preserves its unspent time.
  wallBudget = result.reason === "idle" ? 0 : Math.max(0, wallBudget - (result.now - batch.beforeTime))
  const completed = completeReplay()
  return {
    ...model,
    selected: -1,
    activityFrom: batch.activityFrom,
    suspended:
      (
        run.appliedSettings.controls.findLast(
          (entry) =>
            entry.control.kind === "suspendArrivals" && (!entry.control.agent || entry.control.agent === model.agentId)
        )?.control as Extract<Control, { kind: "suspendArrivals" }> | undefined
      )?.suspended ?? model.suspended,
    revision: model.revision + 1,
    playing:
      !completed &&
      (result.reason !== "idle" || model.suspended) &&
      (!replayEndpoint || run.eventCount < replayEndpoint.eventCount),
    feedback: completed
      ? "Replay reached its exact recorded endpoint."
      : /^(Cannot apply:|Cannot update:|Could not read replay file:)/.test(model.feedback)
        ? model.feedback
        : result.reason === "idle"
          ? model.suspended
            ? "Existing work settled; waiting for edit generation to resume."
            : "No pending events; playback paused."
          : `Playback advanced (${result.reason}).`
  }
}
const advanceSlice = (batch: PendingAdvance): void => {
  if (pendingAdvance !== batch || batch.status.state !== "running") return
  const deadline = performance.now() + 5
  try {
    do {
      if (pendingAdvance !== batch || batch.status.state !== "running") return
      const next = batch.iterator.next()
      if (next.done) {
        batch.status = { state: "result", result: next.value }
        return
      }
    } while (performance.now() < deadline)
  } catch (error) {
    batch.status = { state: "error", error }
  }
}
const failedAdvance = (model: SimulationModel, error: unknown): SimulationModel => ({
  ...model,
  playing: false,
  revision: model.revision + 1,
  feedback: `Run error: ${error instanceof Error ? error.message : String(error)}`
})
const commitTerminalAdvance = (model: SimulationModel, batch: PendingAdvance): SimulationModel => {
  if (pendingAdvance !== batch || batch.status.state === "running") return model
  pendingAdvance = undefined
  return batch.status.state === "result"
    ? completedAdvance(model, batch, batch.status.result)
    : failedAdvance(model, batch.status.error)
}
export const finishSimulationAdvance = (model: SimulationModel): SimulationModel => {
  const batch = pendingAdvance
  advanceGeneration++
  if (!batch || !run) return model
  if (batch.status.state !== "running") return commitTerminalAdvance(model, batch)
  // Invalidate the asynchronous owner before returning the generator. Its next
  // timer wake will see that this batch is no longer current and will stop.
  pendingAdvance = undefined
  try {
    // Closing normalizes the completed step without executing the remaining batch.
    // The required generator return argument is ignored; read actual coordinates
    // only after normalization, which can also remove the final queued fact.
    batch.iterator.return({ reason: "eventLimit", events: run.eventCount - batch.activityFrom, now: run.now })
    return completedAdvance(model, batch, {
      reason: run.queuedFacts.length ? "eventLimit" : "idle",
      events: run.eventCount - batch.activityFrom,
      now: run.now
    })
  } catch (error) {
    return failedAdvance(model, error)
  }
}
export const actSimulation = (model: SimulationModel, action: string): SimulationModel => {
  const settled = finishSimulationAdvance(model)
  // Pause/Resume follows the user's pre-action intent even when closing work
  // discovers an idle queue and automatically pauses the completed boundary.
  return actSimulationNow(action === "play" ? { ...settled, playing: model.playing } : settled, action)
}
/** Reserve one continuation, avoiding duplicate outputs from animation ticks. */
export const simulationContinuation = (): number | undefined => {
  if (!pendingAdvance || pendingAdvance.status.state !== "running" || pendingAdvance.scheduled || pendingAdvance.runner)
    return undefined
  pendingAdvance.scheduled = true
  return pendingAdvance.generation
}
export const continueSimulation = (model: SimulationModel, generation: number): SimulationModel => {
  const batch = pendingAdvance
  if (batch?.generation !== generation || batch.runner) return model
  if (batch.status.state !== "running") return commitTerminalAdvance(model, batch)
  batch.scheduled = false
  advanceSlice(batch)
  return batch.status.state === "running" ? model : commitTerminalAdvance(model, batch)
}
const yieldContinuation = (channel: MessageChannel): Promise<void> => {
  if (typeof globalThis.scheduler?.yield === "function") return globalThis.scheduler.yield()
  return new Promise((resolve) => {
    channel.port1.onmessage = () => resolve()
    channel.port2.postMessage(undefined)
  })
}
/** Drive the reserved batch across browser turns; only the continuation message commits it. */
export const runSimulationContinuation = (generation: number, signal?: AbortSignal): Promise<void> => {
  const batch = pendingAdvance
  if (batch?.generation !== generation) return Promise.resolve()
  if (batch.runner) return batch.runner
  if (batch.status.state !== "running") return Promise.resolve()
  batch.scheduled = false
  const channel = new MessageChannel()
  const runner = (async () => {
    while (true) {
      await yieldContinuation(channel)
      if (signal?.aborted || pendingAdvance !== batch || batch.generation !== generation) return
      if (batch.status.state !== "running") return
      advanceSlice(batch)
      if (batch.status.state !== "running") return
    }
  })()
  batch.runner = runner
  const clearRunner = () => {
    channel.port1.close()
    channel.port2.close()
    if (batch.runner === runner) batch.runner = undefined
  }
  void runner.then(clearRunner, clearRunner)
  return runner
}
export const tickSimulation = (model: SimulationModel, deltaMs: number): SimulationModel => {
  if (fileReadState.error) {
    const feedback = fileReadState.error
    fileReadState.error = undefined
    return { ...model, feedback }
  }
  if (!model.playing || !run) return model
  wallBudget += Math.min(deltaMs, 100) * model.appliedSpeed
  if (pendingAdvance || wallBudget < 50) return model
  try {
    capturePublishedRun()
    pendingAdvance = {
      iterator: run.beginAdvance({
        untilTime: run.now + Math.floor(wallBudget),
        maxEvents: replayEndpoint ? Math.min(100, replayEndpoint.eventCount - run.eventCount) : 100
      }),
      beforeTime: run.now,
      activityFrom: run.eventCount,
      generation: ++advanceGeneration,
      scheduled: false,
      status: { state: "running" }
    }
  } catch (error) {
    return {
      ...model,
      playing: false,
      feedback: `Run error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  const batch = pendingAdvance
  if (!batch) return model
  advanceSlice(batch)
  return batch.status.state === "running" ? model : commitTerminalAdvance(model, batch)
}
/** The dashboard has one resident Run, shared by every displayed agent partition. */
export const simulationRun = () => run
/** Load applied generator values when inspecting a different agent. */
export const selectSimulationAgent = (model: SimulationModel, agent: string): SimulationModel => {
  if (run && !run.appliedSettings.config.session && !run.appliedSettings.config.sessions?.length)
    return { ...model, agentId: agent, item: "" }
  const replay = run?.appliedSettings
  const session = replay?.config.sessions?.find((session) => session.agent === agent) ?? replay?.config.session
  const latest = <Kind extends Control["kind"]>(kind: Kind) =>
    replay?.controls.findLast(
      (entry) => entry.control.kind === kind && (!entry.control.agent || entry.control.agent === agent)
    )?.control as Extract<Control, { kind: Kind }> | undefined
  return {
    ...model,
    agentId: agent,
    item: "",
    draftEpoch: model.draftEpoch + 1,
    editDuration: String(
      latest("editDuration")?.durationMs ?? session?.editDurationMs ?? replay?.config.permitProfile?.durationMs ?? 1
    ),
    pace: String(latest("editPace")?.intervalMs ?? session?.editIntervalMs ?? 100),
    bytes: String(latest("sizes")?.reservationBytes ?? session?.bytes ?? 100),
    suspended: latest("suspendArrivals")?.suspended ?? false
  }
}
export const simulationRenderSnapshot = () => ({
  run: simulationReadRun(),
  replaying: replaySource !== undefined,
  totals: pendingAdvance ? publishedTotals : currentTotals()
})
