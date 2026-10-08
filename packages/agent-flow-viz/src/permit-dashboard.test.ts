import { expect, it } from "vitest"
import { permitAction } from "./permit-controls.ts"
it("decodes only existing permit limits and future POST controls", () => {
  expect(permitAction("permit-limits:16:64")).toEqual({
    kind: "editPermitLimits",
    limits: { perAdvicee: 16, resident: 64 }
  })
  expect(permitAction("permit-profile:absent:0:10")).toEqual({
    kind: "permitProfile",
    profile: { outcome: "absent", durationMs: 0, lifetimeMs: 10 }
  })
  expect(permitAction("start")).toBeUndefined()
  for (const action of [
    "permit-limits:0:64",
    "permit-limits:64:16",
    "permit-limits:16:64:8",
    "permit-profile:unknown:0:10",
    "permit-profile:success:0:0"
  ])
    expect(() => permitAction(action)).toThrow(TypeError)
})
