import { preparationSnapshot } from "../preparation-mini"
import { reviewCapacityView } from "../review-capacity-view"
import { productionFlowView } from "../production-flow/view"
import { type SimulationViewContext } from "./context"
import { mixSummary, appliedWeights } from "./outcome-mix"

export const simulationStatusView = <Message>(
  context: Pick<
    SimulationViewContext<Message>,
    | "run"
    | "showDiagram"
    | "h"
    | "current"
    | "model"
    | "button"
    | "activeReplay"
    | "last"
    | "action"
    | "observations"
    | "numbers"
    | "totals"
    | "latestControl"
  >
) => {
  const {
    run,
    showDiagram,
    h,
    current,
    model,
    button,
    activeReplay,
    last,
    action,
    observations,
    numbers,
    totals,
    latestControl
  } = context
  return [
    h.p(
      [h.Class("simulation-status"), h.Role("status")],
      [
        `${model.playing ? "Running" : "Paused"} · virtual time ${run?.now ?? 0} ms · edits ${model.suspended ? "suspended" : "enabled"} · ${model.feedback}`
      ]
    ),
    h.p(
      [h.Class("simulation-inspection")],
      [
        model.selected < 0
          ? "Viewing latest observation"
          : `Inspecting event ${current?.sequence ?? "unavailable"} at ${current?.time ?? 0} ms; run endpoint ${run?.now ?? 0} ms. Playback paused. Applied controls affect the run endpoint, not this historical event.`
      ]
    ),
    h.div(
      [h.Class("simulation-controls")],
      [
        button("Previous event", "previous"),
        button("Next event", "next"),
        button("Return to latest", "latest"),
        button("Replay from start", "replay-start"),
        button("Inspect oldest retained event", "from-start"),
        button("Bookmark event", "bookmark"),
        button("Go to bookmark", "go-bookmark")
      ]
    ),
    h.p(
      [h.Class("simulation-outcomes")],
      [
        `Run outcomes: ${totals.checked} checked events · ${totals.admitted} observations admitted · ${totals.refused} refusals · ${totals.failed} failures/timeouts · ${totals.advice} confirmed host submissions · ${totals.uncertain} uncertain advice submissions · ${totals.released} released output attempts. ${run && model.suspended && !run.projection.work.some((work) => work.kind !== "pendingFinding") && run.projection.dispatch.requests.length === 0 && run.projection.collection.leases.length === 0 && !run.projection.delivery.slots.some((slot) => ["reserved", "authorized", "uncertain"].includes(slot.phase)) && !run.projection.delivery.submissions.batches.some((batch) => ["reserved", "authorized", "uncertain"].includes(batch.phase)) ? `Transient work settled; ${run.projection.collection.ready.length} retained advice records; arrivals suspended.` : "Work or future arrivals remain."}`
      ]
    ),
    h.p(
      [h.Class("simulation-active-controls")],
      [
        activeReplay
          ? `Active environment: edit interval ${latestControl("editPace")?.intervalMs ?? activeReplay.config.sessions?.find((session) => session.agent === model.agentId)?.editIntervalMs ?? activeReplay.config.session?.editIntervalMs ?? 100} ms · simulated edit duration ${latestControl("editDuration")?.durationMs ?? activeReplay.config.sessions?.find((session) => session.agent === model.agentId)?.editDurationMs ?? activeReplay.config.session?.editDurationMs ?? activeReplay.config.permitProfile?.durationMs ?? 1} ms · Jev delay ${latestControl("jevProfile")?.delayMs ?? activeReplay.config.jevDelay ?? 5} ms · active mix ${mixSummary(appliedWeights(activeReplay))} · reservation ${latestControl("sizes")?.reservationBytes ?? activeReplay.config.sessions?.find((session) => session.agent === model.agentId)?.bytes ?? activeReplay.config.session?.bytes ?? 100} bytes.`
          : "Start a run to apply environment settings."
      ]
    ),
    ...(run && showDiagram
      ? [
          productionFlowView(
            h,
            current?.after ?? run.projection,
            last,
            false,
            (place) => action(`focus:${place}`),
            preparationSnapshot(
              observations
                .filter((frame) => frame.sequence <= (current?.sequence ?? -1))
                .map((frame) => ({ ...frame, origin: "manual" as const }))
            ),
            numbers,
            false,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            model.selected < 0 && model.activityFrom >= 0
              ? observations
                  .filter((frame) => frame.sequence >= model.activityFrom)
                  .map((frame) => ({ ...frame, origin: "manual" as const }))
              : undefined
          )
        ]
      : []),
    ...(run && showDiagram ? [reviewCapacityView(h, current?.after ?? run.projection)] : []),
    h.p(
      [h.Class("simulation-active-effects")],
      [
        activeReplay
          ? `Active facts: work ${(latestControl("environment")?.currentWork ?? activeReplay.config.environment?.currentWork ?? true) ? "current" : "stale"} · credential ${(latestControl("environment")?.credentialReady ?? activeReplay.config.environment?.credentialReady ?? true) ? "ready" : "unavailable"} (generation ${latestControl("environment")?.credentialGeneration ?? activeReplay.config.environment?.credentialGeneration ?? 1}) · source ${(latestControl("environment")?.sourceReadable ?? activeReplay.config.environment?.sourceReadable ?? true) ? "readable" : "unreadable"}. Future host output: ${latestControl("outputProfile")?.outcome ?? activeReplay.config.outputProfile?.outcome ?? "certain"} · delay ${latestControl("outputProfile")?.delayMs ?? activeReplay.config.outputProfile?.delayMs ?? 0} ms · lease ${latestControl("outputProfile")?.leaseMs ?? activeReplay.config.outputProfile?.leaseMs ?? 30000} ms. In-flight output keeps its captured profile.`
          : "No active synthetic environment."
      ]
    ),
    h.details(
      [],
      [
        h.summary([], ["Control history"]),
        h.pre(
          [h.Tabindex(0)],
          [
            activeReplay
              ? JSON.stringify(
                  {
                    initial: activeReplay.config,
                    controls: activeReplay.controls.map((entry) => ({ time: entry.time, ...entry.control }))
                  },
                  null,
                  2
                )
              : "No run started."
          ]
        )
      ]
    )
  ]
}
