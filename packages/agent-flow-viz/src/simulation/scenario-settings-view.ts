import { writerControls } from "../writer-controls"
import { collectionResponseControls } from "../collection-response-controls"
import { outputAttemptControls } from "../output-attempt-controls"
import { noticeControls } from "../notice-controls"
import { callbackControls } from "../callback-controls"
import { adviceeLifecycleControls } from "../advicee-lifecycle-controls"
import { permitControls } from "../permit-controls"
import { jevFaultControls } from "../jev-fault-controls"
import { graphLimitControls } from "../graph-limit-controls"
import { JEV_OUTCOME_ORDER } from "@hapsland/monkey-business"
import { type SimulationViewContext } from "./context"
import { startSettingsForm, editDurationSettingsForm } from "./scenario-forms"
import { graphDrafts, graphFields } from "./file-trees"
import { fileTreesSettings } from "./file-trees-view"
import { outcomeNames, weightField } from "./outcome-mix"

export const scenarioSettingsView = <Message>(
  context: Pick<
    SimulationViewContext<Message>,
    | "h"
    | "button"
    | "controlForm"
    | "input"
    | "model"
    | "select"
    | "changed"
    | "submit"
    | "replaying"
    | "run"
    | "activeReplay"
    | "observed"
    | "action"
    | "treeInput"
    | "treeDraftStatus"
    | "activeTrees"
    | "draftMix"
    | "weights"
    | "weightTotal"
  >
) => {
  const {
    h,
    button,
    controlForm,
    input,
    model,
    select,
    changed,
    submit,
    run,
    replaying,
    activeReplay,
    observed,
    action,
    draftMix,
    weights,
    weightTotal
  } = context
  return h.details(
    [h.Id("resident-scenario-settings"), h.Class("simulation-settings"), h.Open(true)],
    [
      h.summary([], ["Scenario and environment settings"]),
      h.p(
        [h.Class("section-guidance")],
        [
          "Settings below change the run endpoint. A selected historical event keeps its recorded facts. Start / reset begins a new run; each Apply control states which future work it affects."
        ]
      ),
      h.div(
        [h.Class("simulation-controls")],
        [
          button("Normal findings scenario", "preset:normal"),
          button("Slow Jev scenario", "preset:slow"),
          button("Failure → recovery scenario", "preset:failure"),
          button("Capacity pressure scenario", "preset:capacity"),
          button("Freshness change scenario", "preset:stale"),
          button("Credential recovery scenario", "preset:credential"),
          button("Uncertain output scenario", "preset:uncertain"),
          button("Expired delivery lease scenario", "preset:expired"),
          button("Unreadable final source scenario", "preset:source"),
          button("Credential rotation scenario", "preset:rotation"),
          startSettingsForm(context),
          button(model.playing ? "Pause" : "Resume", "play"),
          button("Single step", "step"),
          controlForm("speed", [
            input("speed", "Playback speed (virtual ms / wall ms)", model.speed),
            submit("Apply playback speed")
          ]),
          h.span([h.Class("applied-speed")], [`Active speed: ${model.appliedSpeed}×`])
        ]
      ),
      h.div(
        [h.Class("simulation-controls")],
        [
          ...(run && !activeReplay?.config.session && !activeReplay?.config.sessions?.length
            ? [h.p([], ["Scripted events · no generator controls"])]
            : [
                controlForm("pace", [
                  input("pace", "Edit interval (virtual ms)", model.pace),
                  submit("Apply edit pace")
                ]),
                editDurationSettingsForm(context),
                h.p(
                  [],
                  [
                    "Time between PRE and POST. Start applies it to all agents; Apply changes future edits for the selected agent. Edits already in progress keep their duration."
                  ]
                ),
                controlForm("burst", [input("burst", "Burst count (1–100)", model.burst), submit("Inject edit burst")]),
                button(model.suspended ? "Resume edit generation" : "Suspend edit generation", "suspend")
              ])
        ]
      ),
      h.div(
        [h.Class("simulation-controls")],
        [
          input("delay", "Simulated Jev delay (virtual ms)", model.delay),
          ...(run && !run.appliedSettings.config.session && !run.appliedSettings.config.sessions?.length
            ? []
            : [
                controlForm("sizes", [
                  input("bytes", "Reservation bytes per edit", model.bytes),
                  submit("Apply reservation size")
                ])
              ])
        ]
      ),
      ...(run
        ? [
            adviceeLifecycleControls(h, observed!.adviceeLifecycles, run.agentScopes, action, replaying),
            permitControls(h, run.editPermitLimits, run.futurePermitProfile, action, replaying)
          ]
        : []),
      controlForm("permitLimits", [
        input("permitPerAdvicee", "Per-advicee pending permits", model.permitPerAdvicee),
        input("permitResident", "Resident-wide pending permits", model.permitResident),
        submit("Apply permit limits")
      ]),
      controlForm("permitTiming", [
        input("permitDuration", "PRE to POST duration (virtual ms)", model.permitDuration),
        input("permitLifetime", "Permit lifetime (virtual ms)", model.permitLifetime),
        submit("Apply PRE/POST timing")
      ]),
      ...(run ? [noticeControls(h, run.projection, run.agentScopes, action, replaying)] : []),
      ...(run
        ? [
            writerControls(
              h,
              run.projection,
              run.agentScopes,
              run.now,
              observed!.writerReports,
              action,
              replaying,
              run.capacityMetadata.collectors?.capacity ?? 1
            ),
            collectionResponseControls(
              h,
              run.projection,
              run.agentScopes,
              run.now,
              observed!.collectionResponseReports,
              action,
              replaying
            )
          ]
        : []),
      ...(run ? [callbackControls(h, observed!.callbackTargets, observed!.callbackReports, action, replaying)] : []),
      ...(run ? [outputAttemptControls(h, observed!.outputAttempts, observed!.outputReports, action, replaying)] : []),
      ...(run ? [jevFaultControls(h, run.projection, run.interventions, action, replaying)] : []),
      controlForm("graphLimits", [
        graphLimitControls(h, graphDrafts(model), (field, value) => changed(graphFields[field], value)),
        submit("Apply graph limits")
      ]),
      fileTreesSettings(context),
      h.div(
        [h.Class("simulation-resource-scenario")],
        [
          select("resourceScenario", "Optional resource exercise · applies on Start resident", model.resourceScenario, [
            "none",
            "notices",
            "fit",
            "oversized"
          ]),
          h.p(
            [],
            [
              "Notices use simulated failures and cooldown clocks. Output bytes are supplied synthetic facts; native encoding is not measured."
            ]
          )
        ]
      ),
      h.details(
        [h.Class("simulation-outcome-mix")],
        [
          h.summary([], ["Simulated Jev outcome mix · " + draftMix]),
          h.p([], ["Changes affect new requests. Relative weights determine the displayed probabilities."]),
          ...JEV_OUTCOME_ORDER.map((outcome) =>
            h.label(
              [h.Class("simulation-outcome-slider")],
              [
                outcomeNames[outcome],
                h.input([
                  h.Type("range"),
                  h.Min("0"),
                  h.Max("100"),
                  h.Step("1"),
                  h.AriaLabel(outcomeNames[outcome]),
                  h.Value(String(weights[outcome])),
                  h.OnInput((raw) => changed(weightField(outcome), raw))
                ]),
                h.span(
                  [],
                  [
                    `weight ${weights[outcome]} · ${weightTotal > 0 ? ((weights[outcome] / weightTotal) * 100).toFixed(1) + "%" : "probability unavailable"}`
                  ]
                )
              ]
            )
          ),
          h.p(
            [h.Class("simulation-mix-total")],
            [
              `Total relative weight: ${weightTotal}. ${weightTotal > 0 ? "Normalized probability total: 100%." : "Choose at least one nonzero weight; active mix remains unchanged."}`
            ]
          )
        ]
      ),
      h.div(
        [h.Class("simulation-controls")],
        [
          controlForm("environment", [
            select("currentWork", "Work freshness", model.currentWork, ["current", "stale"]),
            select("credentialReady", "Credential availability", model.credentialReady, ["ready", "unavailable"]),
            input("credentialGeneration", "Credential generation", model.credentialGeneration),
            select("sourceReadable", "Source readability", model.sourceReadable, ["readable", "unreadable"]),
            submit("Apply environment facts")
          ]),
          controlForm("output", [
            select("outputOutcome", "Host output outcome", model.outputOutcome, ["certain", "uncertain", "failed"]),
            input("outputDelay", "Host output delay (virtual ms)", model.outputDelay),
            input("outputLease", "Delivery lease lifetime (virtual ms)", model.outputLease),
            submit("Apply host output profile")
          ])
        ]
      )
    ]
  )
}
