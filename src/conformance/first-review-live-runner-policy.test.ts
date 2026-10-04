import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  requireCleanInstallationPreview,
  requireCreatedInstallation
} from "../../scripts/first-review-live-runner-policy.mjs"

const runner = readFileSync(new URL("../../scripts/run-first-review-live-milestone.mjs", import.meta.url), "utf8")
const evidenceGuide = readFileSync(new URL("../../evidence/first-review/README.md", import.meta.url), "utf8")
const historicalEvidence = JSON.parse(
  readFileSync(new URL("../../evidence/first-review/live-installed-codex-0.155.1.json", import.meta.url), "utf8")
) as { readonly package: { readonly source: string; readonly cliResolvedInsideInstalledArtifact?: boolean } }

describe("first-review live runner provenance policy", () => {
  it("derives the installed CLI and artifact digest from its own npm pack result", () => {
    expect(runner).toContain('["pack", "--json", "--pack-destination", runnerRoot]')
    expect(runner).toContain('createHash("sha256").update(await readFile(tarballPath)).digest("hex")')
    expect(runner).toContain("const invokedCli = join(installPrefix")
    expect(runner).toContain("const resolvedCli = await realpath(cli)")
    expect(runner).toContain("invoked CLI does not resolve inside the installed packed artifact")
    expect(runner).not.toContain("REVIEW_LIVE_INSTALLED_CLI")
    expect(runner).not.toContain("REVIEW_LIVE_ARTIFACT_SHA256")
  })

  it("queries the selected host version and keeps live execution behind explicit selection", () => {
    expect(runner).toContain('process.argv.includes("--live")')
    expect(runner).toContain('run("codex", ["--version"]')
    expect(runner.indexOf("if (!explicitLive)")).toBeLessThan(runner.indexOf("await mkdtemp"))
  })

  it("distinguishes future self-verified provenance from the externally supplied historical record", () => {
    expect(runner).toContain(
      'source: registryArtifact ? "npm-registry-installation" : "runner-packed-release-installation"'
    )
    expect(runner).toContain("cliResolvedInsideInstalledArtifact: true")
    expect(historicalEvidence.package).toMatchObject({ source: "packed-release-installation" })
    expect(historicalEvidence.package.cliResolvedInsideInstalledArtifact).toBeUndefined()
    expect(evidenceGuide).toContain("supplied externally and were not independently verified")
  })

  it("rejects a pre-existing owned installation without making it cleanup-owned", () => {
    let createdByRun = false
    let cleanupCalls = 0
    try {
      requireCleanInstallationPreview({ status: "preview", installed: true, proposal: { digest: "a".repeat(64) } })
      createdByRun = true
    } catch {
      // Expected: the runner must stop before installation mutation.
    } finally {
      if (createdByRun) cleanupCalls += 1
    }
    expect(createdByRun).toBe(false)
    expect(cleanupCalls).toBe(0)
    expect(() => requireCreatedInstallation({ status: "already-installed" })).toThrow(
      "did not create a new scoped installation"
    )
    expect(runner.indexOf("requireCreatedInstallation(installResult)")).toBeLessThan(runner.indexOf("installed = true"))
    expect(runner.indexOf("installed = true")).toBeLessThan(runner.indexOf("if (installed && cli !== undefined)"))
  })
})
