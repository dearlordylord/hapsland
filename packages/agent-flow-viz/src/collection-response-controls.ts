import type { HtmlBuilder } from "foldkit/html"
import type { CanonicalProjection } from "@hapsland/canonical-policy/canonical/adapter"
import {
  validateCollectionResponseControl,
  type CollectionResponseControl,
  type CollectionResponseReport
} from "../../monkey-business/src/collection-scenario"

const resultLabels = {
  applied: "Applied",
  missing: "Refused: response has ended or is unavailable",
  wrongScope: "Refused: response belongs to another lifetime or round",
  alreadyAttempting: "Refused: collection is already in progress",
  identityExhausted: "Refused: no response identity remains",
  contextBound: "Refused: response storage is full"
} as const
export function collectionResponseAction(action: string): CollectionResponseControl | undefined {
  if (!action.startsWith("response:")) return undefined
  return validateCollectionResponseControl(JSON.parse(decodeURIComponent(action.slice("response:".length))))
}
export function collectionResponseControls<Message>(
  h: HtmlBuilder<Message>,
  projection: CanonicalProjection,
  scopes: readonly { readonly agent: string; readonly partition: number }[],
  now: number,
  reports: readonly CollectionResponseReport[],
  act: (value: string) => Message,
  disabled: boolean
) {
  const button = (label: string, control: CollectionResponseControl) =>
    h.button(
      [
        h.Type("button"),
        h.Disabled(disabled),
        h.OnClick(act(`response:${encodeURIComponent(JSON.stringify(validateCollectionResponseControl(control)))}`))
      ],
      [label]
    )
  return h.details(
    [],
    [
      h.summary([], ["Edit response collection"]),
      h.p(
        [],
        [
          "Each new response keeps its original advicee, lifetime, round and deadline. Closing one response leaves other collectors and admitted work running."
        ]
      ),
      ...projection.rounds.flatMap((round) => {
        const scope = scopes.find((value) => value.partition === round.partition)
        if (!scope || now >= 2 ** 48 - 20) return []
        return [
          button(`Open response for ${scope.agent}`, {
            kind: "collectionResponse",
            action: "open",
            agent: scope.agent,
            response: {
              partition: round.partition,
              lifetime: round.lifetime,
              round: round.id,
              started: now,
              deadline: now + 20,
              admittedBlock: false
            }
          })
        ]
      }),
      h.p([], ["Recently issued responses are shown below. An ended response visibly refuses collection."]),
      ...reports
        .filter((report) => report.issued !== undefined)
        .slice(-12)
        .map((report) => {
          const target = report.issued
          if (!target) return h.p([], [])
          return h.fieldset(
            [],
            [
              h.legend(
                [],
                [
                  `Response ${target.id} · ${report.control.agent} · lifetime ${target.lifetime} · round ${target.round}`
                ]
              ),
              button("Collect current advice", {
                kind: "collectionResponse",
                action: "attempt",
                agent: report.control.agent,
                target,
                currentBlock: false
              }),
              button("Close response", {
                kind: "collectionResponse",
                action: "close",
                agent: report.control.agent,
                target
              })
            ]
          )
        }),
      h.ol(
        [h.AriaLabel("Edit response collection results")],
        reports
          .slice(-12)
          .map((report) =>
            h.li([], [`${report.at} virtual ms · ${report.control.action} · ${resultLabels[report.result]}`])
          )
      )
    ]
  )
}
