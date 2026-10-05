import { describe, expect, it } from "vitest"
import { decodeConfigurationDocument } from "../configuration/decode.ts"
import { resolveConfiguration, validateCapturedPolicy } from "../configuration/resolve.ts"
import { selectContextPath, selectGlobalPath } from "./file-policy.ts"
import {
  contextDirectFilePolicy,
  resolvedDirectFilePolicy,
  selectedByDirectFilePolicy
} from "../direct-event/selection.ts"

const resolve = (user: object = {}, project: object = {}) =>
  resolveConfiguration([
    {
      name: "user",
      source: "user.jsonc",
      document: decodeConfigurationDocument({ version: 1, ...user }, "user.jsonc")
    },
    {
      name: "project",
      source: "project.jsonc",
      document: decodeConfigurationDocument({ version: 1, ...project }, "project.jsonc")
    }
  ])

describe("changed-root and supporting-context selection", () => {
  it("inherits root scopes until context is explicitly selected, preserving privacy", () => {
    const inherited = resolve({ includes: ["src/**"], excludes: ["src/private/**"] })
    expect(selectContextPath(inherited, "shared/customer.ts").selected).toBe(false)
    expect(selectContextPath(inherited, "src/private/customer.ts").selected).toBe(false)
    const expanded = resolve(
      { includes: ["src/**"], privacyExcludes: ["shared/private/**"] },
      { contextIncludes: ["src/**", "shared/**"] }
    )
    expect(selectGlobalPath(expanded, "shared/customer.ts").selected).toBe(false)
    expect(selectContextPath(expanded, "shared/customer.ts").selected).toBe(true)
    expect(selectContextPath(expanded, "shared/private/customer.ts").selected).toBe(false)
    expect(selectContextPath(expanded, "shared/.env").selected).toBe(false)
    expect(selectContextPath(expanded, "shared/generated/customer.ts").selected).toBe(false)
    validateCapturedPolicy(expanded)
  })

  it("replaces context includes and accumulates explicit context exclusions", () => {
    const policy = resolve(
      { contextIncludes: ["shared/**"], contextExcludes: ["shared/private/**"] },
      { contextIncludes: ["shared/**", "lib/**"], contextExcludes: ["lib/private/**"] }
    )
    expect(
      policy.overriddenContextIncludes.some((entry) => entry.origin.field === "contextIncludes" && !entry.active)
    ).toBe(true)
    expect(policy.contextExcludes.map(({ value }) => value)).toEqual(["shared/private/**", "lib/private/**"])
    expect(selectContextPath(policy, "shared/private/a.ts").selected).toBe(false)
    expect(selectContextPath(policy, "lib/private/a.ts").selected).toBe(false)
    expect(selectContextPath(resolve({}, { contextIncludes: [] }), "a.ts").reason).toBe("empty-includes")
  })

  it.each([
    [undefined, [true, true, true]],
    [["typescript"], [true, false, false]],
    [["rust"], [false, true, false]],
    [["bend"], [false, false, true]],
    [[], [false, false, false]]
  ] as const)("selects registered changed-root languages %j without restricting context", (languages, expected) => {
    const policy = resolve(languages === undefined ? {} : { languages })
    const direct = resolvedDirectFilePolicy(policy)
    for (const [index, path] of ["a.ts", "a.rs", "a.bend"].entries()) {
      expect(selectGlobalPath(policy, path).selected).toBe(expected[index])
      expect(selectedByDirectFilePolicy(path, direct)).toBe(expected[index])
      expect(selectedByDirectFilePolicy(path, contextDirectFilePolicy(direct))).toBe(true)
    }
    expect(selectGlobalPath(policy, "readme.md").selected).toBe(false)
  })

  it("inherits omitted languages, replaces with empty, and binds every new field into identity", () => {
    expect(resolve({ languages: ["rust"] }).languages.value).toEqual(["rust"])
    expect(resolve({ languages: ["rust"] }, { languages: [] }).languages.value).toEqual([])
    const base = resolve()
    for (const changed of [{ languages: [] }, { contextIncludes: [] }, { contextExcludes: ["private/**"] }]) {
      expect(resolve({}, changed).digest).not.toBe(base.digest)
    }
    for (const field of ["contextIncludes", "contextExcludes"]) {
      expect(() => resolve({}, { [field]: ["../private/**"] })).toThrow()
    }
    expect(() => resolve({}, { languages: ["python"] })).toThrow()
  })
})
