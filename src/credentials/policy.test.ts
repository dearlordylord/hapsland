import { expect, it } from "vitest"
import { deriveLookupPlan, deriveSavePlan } from "@hapsland/runtime-inputs/credentials/policy"
import {
  credentialLookupSources,
  credentialSaveAvailable
} from "@hapsland/canonical-policy/canonical/credential-adapter"

const expectedSources = [
  ["environment", "native"],
  ["environment"],
  ["environment", "native"],
  ["environment"],
  ["environment", "user", "native"],
  ["environment", "user"],
  ["environment", "native"],
  ["environment"],
  ["environment", "native"],
  ["environment"],
  ["environment", "native"],
  ["environment"],
  ["environment", "project-local", "user", "native"],
  ["environment", "project-local", "user"],
  ["environment", "native"],
  ["environment"],
  ["environment", "native"],
  ["environment"],
  ["environment", "native"],
  ["environment"],
  ["environment", "project", "user", "native"],
  ["environment", "project", "user"],
  ["environment", "native"],
  ["environment"],
  ["environment", "native"],
  ["environment"],
  ["environment", "native"],
  ["environment"],
  ["environment", "project-local", "project", "user", "native"],
  ["environment", "project-local", "project", "user"],
  ["environment", "native"],
  ["environment"]
] as const

it("preserves credential plans for every fact combination and changing native targets", () => {
  for (let bits = 0; bits < 32; bits++) {
    for (const suffix of ["first", "second"]) {
      const context = {
        envVar: `KEY_${suffix}`,
        referenceExplicit: Boolean(bits & 1),
        captured: Boolean(bits & 2),
        root: bits & 4 ? `/root/${suffix}` : undefined,
        userFile: `/user/${suffix}`,
        nativeTarget: `native-${suffix}`,
        projectLocalFile: bits & 8 ? `/local/${suffix}` : undefined,
        projectFile: bits & 16 ? `/project/${suffix}` : undefined
      }
      const steps = {
        environment: { kind: "environment", envVar: context.envVar },
        native: { kind: "native", target: context.nativeTarget },
        user: { kind: "user", file: context.userFile },
        project: { kind: "project", file: context.projectFile },
        "project-local": { kind: "project-local", file: context.projectLocalFile }
      }
      expect(deriveLookupPlan(context)).toEqual(expectedSources[bits]!.map((kind) => steps[kind]))
      expect(deriveSavePlan(context, "user")).toEqual({
        destination: "user",
        target: context.userFile,
        scope: "user",
        storage: "Local plaintext file"
      })
      expect(deriveSavePlan(context, "native")).toEqual({
        destination: "native",
        target: context.nativeTarget,
        scope: "user",
        storage: "Platform credential store"
      })
      expect(deriveSavePlan(context, "project-local")).toEqual(
        bits & 8
          ? {
              destination: "project-local",
              target: context.projectLocalFile,
              scope: "project",
              storage: "Local plaintext file"
            }
          : undefined
      )
    }
  }
})
it("keeps cached source decisions immutable and rejects malformed facts before cache reuse", () => {
  const sources = credentialLookupSources(false, false, true, true, true)
  expect(Object.isFrozen(sources)).toBe(true)
  expect(sources).toEqual(["environment", "project-local", "project", "user", "native"])
  // @ts-expect-error malformed native facts must not collide with a cached Boolean key
  expect(() => credentialLookupSources(0, false, true, true, true)).toThrow(TypeError)
  // @ts-expect-error unknown destinations must not become cached save decisions
  expect(() => credentialSaveAvailable("other", true)).toThrow()
})
