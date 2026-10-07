import { describe, expect, it } from "vitest"
import { decodeConfigurationDocument } from "@hapsland/runtime-inputs/configuration/decode"
import {
  effectiveReviewBackend,
  resolveConfiguration,
  validateCapturedPolicy
} from "@hapsland/runtime-inputs/configuration/resolve"
import { providerIdentity } from "@hapsland/review-definition/review-providers/catalog"

const cloudflare = { provider: "cloudflare", model: "clef", accountId: "a".repeat(32) } as const
describe("review provider configuration authority", () => {
  it("defaults to Jev and derives an environment-only Cloudflare credential reference", () => {
    const defaults = resolveConfiguration([])
    expect(effectiveReviewBackend(defaults)).toEqual({ provider: "jev" })
    expect(defaults.credentialEnvVar.value).toBe("TYPESAFE_API_KEY")
    const policy = resolveConfiguration([
      { name: "user", source: "user.jsonc", document: { version: 1, reviewBackend: cloudflare } },
      { name: "project", source: "project.jsonc", document: { version: 1, credentialEnvVar: "PROJECT_KEY" } }
    ])
    expect(policy.credentialEnvVar.value).toBe("CLOUDFLARE_API_TOKEN")
    expect(policy.credentialEnvVar.origin.layer).toBe("user")
    expect(() => validateCapturedPolicy(policy)).not.toThrow()
  })
  it("keeps an explicit user token reference and rejects project destination changes", () => {
    const policy = resolveConfiguration([
      {
        name: "user",
        source: "user",
        document: { version: 1, reviewBackend: cloudflare, credentialEnvVar: "MY_CF_TOKEN" }
      }
    ])
    expect(policy.credentialEnvVar.value).toBe("MY_CF_TOKEN")
    expect(() =>
      resolveConfiguration([
        { name: "project", source: "project", document: { version: 1, reviewBackend: cloudflare } }
      ])
    ).toThrowError(expect.objectContaining({ field: "reviewBackend" }))
  })
  it("rejects invalid models, account IDs, missing selectors and arbitrary endpoints", () => {
    for (const reviewBackend of [
      { ...cloudflare, model: "arbitrary" },
      { ...cloudflare, accountId: "../other" },
      { provider: "cloudflare", accountId: cloudflare.accountId },
      { ...cloudflare, endpoint: "https://other.invalid" }
    ])
      expect(() => decodeConfigurationDocument({ version: 1, reviewBackend }, "user")).toThrow()
  })
  it("binds model and account changes into captured configuration identity", () => {
    const policy = (
      reviewBackend: typeof cloudflare | { provider: "cloudflare"; model: "clef-flash"; accountId: string }
    ) => resolveConfiguration([{ name: "user", source: "user", document: { version: 1, reviewBackend } }])
    const first = policy(cloudflare)
    expect(policy({ ...cloudflare, model: "clef-flash" }).digest).not.toBe(first.digest)
    expect(policy({ ...cloudflare, accountId: "b".repeat(32) }).digest).not.toBe(first.digest)
    expect(providerIdentity(effectiveReviewBackend(first)).destination).toContain(`/accounts/${cloudflare.accountId}/`)
  })
  it("binds OpenAI selection and its user-owned credential reference", () => {
    const openai = { provider: "openai", model: "gpt-6-luna" } as const
    const policy = resolveConfiguration([
      { name: "user", source: "user", document: { version: 1, reviewBackend: openai } },
      { name: "project", source: "project", document: { version: 1, credentialEnvVar: "PROJECT_KEY" } }
    ])
    expect(effectiveReviewBackend(policy)).toEqual(openai)
    expect(policy.credentialEnvVar.value).toBe("OPENAI_API_KEY")
    expect(policy.credentialEnvVar.origin.layer).toBe("user")
    expect(() => validateCapturedPolicy(policy)).not.toThrow()
    expect(providerIdentity(openai)).toEqual({
      provider: "openai",
      model: "gpt-6-luna",
      destination: "https://api.openai.com/v1/decisions"
    })
    expect(policy.digest).not.toBe(resolveConfiguration([]).digest)
    const explicit = resolveConfiguration([
      {
        name: "user",
        source: "user",
        document: { version: 1, reviewBackend: openai, credentialEnvVar: "MY_OPENAI_KEY" }
      }
    ])
    expect(explicit.credentialEnvVar.value).toBe("MY_OPENAI_KEY")
    expect(() =>
      resolveConfiguration([{ name: "project", source: "project", document: { version: 1, reviewBackend: openai } }])
    ).toThrowError(expect.objectContaining({ field: "reviewBackend" }))
    for (const reviewBackend of [
      { provider: "openai" },
      { ...openai, model: "gpt-other" },
      { ...openai, endpoint: "https://other.invalid" }
    ])
      expect(() => decodeConfigurationDocument({ version: 1, reviewBackend }, "user")).toThrow()
  })
})
