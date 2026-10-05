import type { HtmlBuilder } from "foldkit/html"
import {
  validatePermitControl,
  type PermitControl,
  type PermitLimits,
  type PermitProfile
} from "../../monkey-business/src/permit-controls"

/** Dashboard action decoding does not make admission decisions. */
export const permitAction = (action: string): PermitControl | undefined => {
  if (action.startsWith("permit-limits:")) {
    const [local, resident, extra] = action.slice("permit-limits:".length).split(":")
    if (!local || !resident || extra !== undefined) throw new TypeError("invalid edit-permit limit action")
    return validatePermitControl({
      kind: "editPermitLimits",
      limits: { perAdvicee: Number(local), resident: Number(resident) }
    })
  }
  if (action.startsWith("permit-profile:")) {
    const [outcome, duration, lifetime, extra] = action.slice("permit-profile:".length).split(":")
    if (!outcome || !duration || !lifetime || extra !== undefined)
      throw new TypeError("invalid PRE/POST profile action")
    return validatePermitControl({
      kind: "permitProfile",
      profile: { outcome, durationMs: Number(duration), lifetimeMs: Number(lifetime) }
    })
  }
  return undefined
}

export const permitControls = <Message>(
  h: HtmlBuilder<Message>,
  limits: PermitLimits,
  profile: PermitProfile,
  act: (action: string) => Message,
  disabled: boolean
) => {
  const button = (label: string, action: string) =>
    h.button([h.Type("button"), h.Disabled(disabled), h.OnClick(act(action))], [label])
  return h.details(
    [h.Class("simulation-permit-controls")],
    [
      h.summary([], ["Edit permits and PRE/POST outcomes"]),
      h.p(
        [],
        [
          `Pending permit limits: ${limits.perAdvicee} per advicee, ${limits.resident} resident-wide. Production defaults are 32 and 4096; demo values and replay values remain explicit.`
        ]
      ),
      h.div([], [button("Use production permit defaults", "permit-limits:32:4096")]),
      h.p(
        [],
        [
          `Future edits: ${profile.durationMs} ms from PRE to POST, ${profile.lifetimeMs} ms permit lifetime. Issued permits retain their captured deadline and outcome.`
        ]
      ),
      h.div(
        [],
        (["success", "failure", "duplicate", "absent"] as const).map((outcome) =>
          button(
            { success: "Successful POST", failure: "Failed POST", duplicate: "Duplicate POST", absent: "No POST" }[
              outcome
            ],
            `permit-profile:${outcome}:${profile.durationMs}:${profile.lifetimeMs}`
          )
        )
      )
    ]
  )
}
