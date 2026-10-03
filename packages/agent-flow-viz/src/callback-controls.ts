import type { HtmlBuilder } from "foldkit/html";
import { validateCallbackControl, type CallbackControl, type CallbackReport, type CallbackTarget } from "../../monkey-business/src/callback-controls";

const labels = { hold: "Hold", release: "Release", drop: "Drop", duplicate: "Repeat", reorder: "Move to now" } as const;
const effects = { jevStarted: "Jev request starts", jevInterrupted: "Jev request is interrupted", jevSettled: "Jev request completes",
  preparationCompleted: "Preparation completes", outputTerminal: "Advice delivery completes" } as const;
const results = { applied: "Applied", missing: "Refused: original completion is unavailable",
  notQueued: "Refused: completion is not queued", notHeld: "Refused: completion is not held" } as const;

/** Dashboard decoding supplies syntax only; shared Bend records applicability. */
export function callbackAction(value: string): CallbackControl | undefined {
  if (!value.startsWith("completion:")) return undefined;
  return validateCallbackControl(JSON.parse(decodeURIComponent(value.slice("completion:".length))) as CallbackControl);
}
export function callbackControls<Message>(h: HtmlBuilder<Message>, targets: readonly CallbackTarget[],
  reports: readonly CallbackReport[], act: (value: string) => Message, disabled: boolean) {
  return h.details([], [h.summary([], ["Completion delivery"]),
    h.p([], ["Hold, release, drop, repeat or move an already issued completion. Repeating a completed request preserves its original advicee and lifetime."]),
    ...targets.map(target => h.fieldset([], [h.legend([], [
      `Advicee ${target.owner.partition} · lifetime ${target.owner.lifetime} · round ${target.owner.round} · operation ${target.owner.operation} · ${effects[target.effect.kind]}`,
    ]), h.div([h.Class("simulation-controls")], (Object.keys(labels) as CallbackControl["action"][]).map(action => {
      const value = validateCallbackControl({ kind: "callback", action, target });
      return h.button([h.Type("button"), h.Disabled(disabled), h.OnClick(act(`completion:${encodeURIComponent(JSON.stringify(value))}`))], [labels[action]]);
    }))])),
    ...(targets.length ? [] : [h.p([], ["No issued completions retained."])]),
    h.ol([h.AriaLabel("Completion delivery results")], reports.slice(-12).map(report => h.li([], [
      `${report.at} virtual ms · action ${report.controlSequence} · ${labels[report.control.action]} · ${results[report.result]}`,
    ]))),
  ]);
}
