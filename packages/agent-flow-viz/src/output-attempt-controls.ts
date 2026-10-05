import type { HtmlBuilder } from "foldkit/html";
import { validateOutputAttemptControl, type OutputAttemptControl, type OutputAttemptObservation, type OutputAttemptReport } from "../../monkey-business/src/output-controls";

const outcomes = ["certain", "uncertain", "failed"] as const;
const labels = { certain: "Delivery confirmed", uncertain: "Delivery uncertain", failed: "Delivery failure reported" } as const;
const results = { applied: "Applied", missing: "Refused: original delivery is unavailable", notQueued: "Refused: delivery is not scheduled" } as const;
export function outputAttemptAction(value: string): OutputAttemptControl | undefined {
  if (!value.startsWith("output-attempt:")) return undefined;
  return validateOutputAttemptControl(JSON.parse(decodeURIComponent(value.slice("output-attempt:".length))));
}
export function outputAttemptControls<Message>(h: HtmlBuilder<Message>, attempts: readonly OutputAttemptObservation[],
  reports: readonly OutputAttemptReport[], act: (value: string) => Message, disabled: boolean) {
  return h.details([], [h.summary([], ["Advice delivery outcomes"]),
    h.p([], ["Change the reported result of an issued delivery. Its advice items and deadline stay fixed. A reported failure after authorization may still have reached the destination and records uncertainty."]),
    ...attempts.map(attempt => h.fieldset([], [h.legend([], [
      `Advicee ${attempt.target.owner.partition} · round ${attempt.target.owner.round} · ${attempt.capture.attempt.kind === "finish" ? `${attempt.capture.attempt.selected.length} advice items` : "1 advice item"}`,
    ]), h.p([], [`Expected completion ${attempt.dueAt} virtual ms · delivery lease ends ${attempt.capture.started + attempt.capture.profile.leaseMs} virtual ms · ${attempt.delivery}`]),
    h.div([h.Class("simulation-controls")], outcomes.map(outcome => {
      const control = validateOutputAttemptControl({ kind: "outputAttempt", target: attempt.target, outcome });
      return h.button([h.Type("button"), h.Disabled(disabled), h.OnClick(act(`output-attempt:${encodeURIComponent(JSON.stringify(control))}`))], [labels[outcome]]);
    }))])),
    ...(attempts.length ? [] : [h.p([], ["No issued advice deliveries retained."])]),
    h.ol([h.AriaLabel("Advice delivery outcome results")], reports.slice(-12).map(report => h.li([], [
      `${report.at} virtual ms · ${labels[report.control.outcome]} · ${results[report.result]}`,
    ]))),
  ]);
}
