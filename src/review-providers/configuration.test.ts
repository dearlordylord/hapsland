import { describe, expect, it } from "vitest";
import { decodeConfigurationDocument } from "../configuration/decode.ts";
import { effectiveReviewBackend, resolveConfiguration, validateCapturedPolicy } from "../configuration/resolve.ts";
import { providerIdentity } from "./catalog.ts";

const cloudflare = { provider: "cloudflare", model: "clef", accountId: "a".repeat(32) } as const;
describe("review provider configuration authority", () => {
  it("defaults to Jev and derives an environment-only Cloudflare credential reference", () => {
    const defaults = resolveConfiguration([]);
    expect(effectiveReviewBackend(defaults)).toEqual({ provider: "jev" });
    expect(defaults.credentialEnvVar.value).toBe("TYPESAFE_API_KEY");
    const policy = resolveConfiguration([
      { name: "user", source: "user.jsonc", document: { version: 1, reviewBackend: cloudflare } },
      { name: "project", source: "project.jsonc", document: { version: 1, credentialEnvVar: "PROJECT_KEY" } },
    ]);
    expect(policy.credentialEnvVar.value).toBe("CLOUDFLARE_API_TOKEN");
    expect(policy.credentialEnvVar.origin.layer).toBe("user");
    expect(() => validateCapturedPolicy(policy)).not.toThrow();
  });
  it("keeps an explicit user token reference and rejects project destination changes", () => {
    const policy = resolveConfiguration([{ name: "user", source: "user", document: {
      version: 1, reviewBackend: cloudflare, credentialEnvVar: "MY_CF_TOKEN",
    } }]);
    expect(policy.credentialEnvVar.value).toBe("MY_CF_TOKEN");
    expect(() => resolveConfiguration([{ name: "project", source: "project", document: {
      version: 1, reviewBackend: cloudflare,
    } }])).toThrowError(expect.objectContaining({ field: "reviewBackend" }));
  });
  it("rejects invalid models, account IDs, missing selectors and arbitrary endpoints", () => {
    for (const reviewBackend of [
      { ...cloudflare, model: "arbitrary" }, { ...cloudflare, accountId: "../other" },
      { provider: "cloudflare", accountId: cloudflare.accountId },
      { ...cloudflare, endpoint: "https://other.invalid" },
    ]) expect(() => decodeConfigurationDocument({ version: 1, reviewBackend }, "user")).toThrow();
  });
  it("binds model and account changes into captured configuration identity", () => {
    const policy = (reviewBackend: typeof cloudflare | { provider: "cloudflare"; model: "clef-flash"; accountId: string }) =>
      resolveConfiguration([{ name: "user", source: "user", document: { version: 1, reviewBackend } }]);
    const first = policy(cloudflare);
    expect(policy({ ...cloudflare, model: "clef-flash" }).digest).not.toBe(first.digest);
    expect(policy({ ...cloudflare, accountId: "b".repeat(32) }).digest).not.toBe(first.digest);
    expect(providerIdentity(effectiveReviewBackend(first)).destination).toContain(`/accounts/${cloudflare.accountId}/`);
  });
});
