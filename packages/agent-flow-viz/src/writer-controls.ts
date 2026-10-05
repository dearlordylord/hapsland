import type { HtmlBuilder } from "foldkit/html"
import type { CanonicalProjection } from "../../../src/canonical/adapter"
import { validateWriterControl, type WriterControl, type WriterReport } from "../../monkey-business/src/writer-controls"

export function writerAction(action: string): WriterControl | undefined {
  if (!action.startsWith("writer:")) return undefined
  return validateWriterControl(JSON.parse(decodeURIComponent(action.slice("writer:".length))))
}
export function writerControls<Message>(
  h: HtmlBuilder<Message>,
  projection: CanonicalProjection,
  scopes: readonly { readonly agent: string; readonly partition: number }[],
  now: number,
  reports: readonly WriterReport[],
  act: (value: string) => Message,
  disabled: boolean,
  capacity = 1
) {
  const button = (label: string, control: WriterControl) =>
    h.button(
      [
        h.Type("button"),
        h.Disabled(disabled),
        h.OnClick(act(`writer:${encodeURIComponent(JSON.stringify(validateWriterControl(control)))}`))
      ],
      [label]
    )
  return h.details(
    [],
    [
      h.summary([], ["Background advice waiters"]),
      h.p(
        [],
        [
          "A waiter keeps its original deadline and holds no advice lease while waiting. Another trigger cannot replace its writer. Stop and other advicees continue independently."
        ]
      ),
      ...projection.rounds.flatMap((round) => {
        const scope = scopes.find((value) => value.partition === round.partition)
        if (!scope || now >= 2 ** 48 - 20) return []
        return [
          button(`Wait for advice for ${scope.agent}`, {
            kind: "backgroundWriter",
            action: "claim",
            agent: scope.agent,
            capture: {
              target: { partition: round.partition, lifetime: round.lifetime, round: round.id, token: round.id },
              claimStarted: now,
              claimLifetimeMs: 20,
              capacity,
              response: {
                partition: round.partition,
                lifetime: round.lifetime,
                round: round.id,
                started: now,
                deadline: now + 20,
                admittedBlock: false
              }
            }
          })
        ]
      }),
      ...reports
        .filter((report) => report.control.action === "claim" && report.issued !== undefined)
        .slice(-12)
        .map((report) => {
          if (report.control.action !== "claim" || !report.issued) return h.p([], [])
          const target = report.control.capture.target
          return h.fieldset(
            [],
            [
              h.legend(
                [],
                [`Writer for ${report.control.agent} · response ${report.issued.id} · round ${target.round}`]
              ),
              button("Collect available advice", {
                kind: "backgroundWriter",
                action: "attempt",
                agent: report.control.agent,
                target,
                currentBlock: false
              }),
              button("Release waiter", {
                kind: "backgroundWriter",
                action: "release",
                agent: report.control.agent,
                target
              }),
              button("Sample original timeout", {
                kind: "backgroundWriter",
                action: "expire",
                agent: report.control.agent,
                target
              })
            ]
          )
        }),
      h.ol(
        [h.AriaLabel("Background waiter results")],
        reports
          .slice(-12)
          .map((report) => h.li([], [`${report.at} virtual ms · ${report.control.action} · ${report.result}`]))
      )
    ]
  )
}
