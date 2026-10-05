import type { HtmlBuilder } from "foldkit/html"
import {
  validateAdviceeLifecycle,
  type AdviceeLifecycleControl,
  type AdviceeLifecycleEntry
} from "../../monkey-business/src/advicee-lifecycle"

/** Browser action decoding only; applicability and lifetime changes stay shared. */
export function adviceeLifecycleAction(action: string): AdviceeLifecycleControl | undefined {
  if (!action.startsWith("advicee-lifecycle:")) return undefined
  const [choice, encoded, extra] = action.slice("advicee-lifecycle:".length).split(":")
  if (extra !== undefined || encoded === undefined || !["disconnect", "remove", "resume"].includes(choice ?? ""))
    throw new TypeError("invalid advicee lifecycle action")
  return validateAdviceeLifecycle({
    kind: "adviceeLifecycle",
    agent: decodeURIComponent(encoded),
    action: choice as AdviceeLifecycleControl["action"]
  })
}

export function adviceeLifecycleControls<Message>(
  h: HtmlBuilder<Message>,
  entries: readonly AdviceeLifecycleEntry[],
  scopes: readonly { readonly partition: number; readonly agent: string }[],
  act: (action: string) => Message,
  disabled: boolean
) {
  return h.details(
    [h.Class("simulation-advicee-lifecycle")],
    [
      h.summary([], ["Advicee activity and lifetimes"]),
      h.p(
        [],
        [
          "End activity declares an advicee's departure. A temporary connection loss does not end activity. Resume starts a fresh lifetime; issued old callbacks keep their original identity."
        ]
      ),
      ...entries.map((entry) => {
        const agent = scopes.find((scope) => scope.partition === entry.partition)?.agent
        const button = (label: string, action: AdviceeLifecycleControl["action"]) =>
          h.button(
            [
              h.Type("button"),
              h.Disabled(disabled || agent === undefined),
              h.OnClick(act(`advicee-lifecycle:${action}:${encodeURIComponent(agent ?? "")}`))
            ],
            [label]
          )
        return h.fieldset(
          [],
          [
            h.legend([], [`${agent ?? `Advicee ${entry.partition}`} · lifetime ${entry.lifetime} · ${entry.status}`]),
            h.div(
              [h.Class("simulation-controls")],
              [
                button("End activity", "disconnect"),
                button("Remove advicee", "remove"),
                button("Resume fresh activity", "resume")
              ]
            )
          ]
        )
      })
    ]
  )
}
