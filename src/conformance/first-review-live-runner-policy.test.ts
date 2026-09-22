import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runner = readFileSync(new URL("../../scripts/run-first-review-live-milestone.mjs", import.meta.url), "utf8");

describe("first-review live runner provenance policy", () => {
  it("derives the installed CLI and artifact digest from its own npm pack result", () => {
    expect(runner).toContain('["pack", "--json", "--pack-destination", runnerRoot]');
    expect(runner).toContain('createHash("sha256").update(await readFile(tarballPath)).digest("hex")');
    expect(runner).toContain("const invokedCli = join(installPrefix");
    expect(runner).toContain("const resolvedCli = await realpath(cli)");
    expect(runner).toContain("invoked CLI does not resolve inside the installed packed artifact");
    expect(runner).not.toContain("REVIEW_LIVE_INSTALLED_CLI");
    expect(runner).not.toContain("REVIEW_LIVE_ARTIFACT_SHA256");
  });

  it("queries the selected host version and keeps paid execution behind explicit live selection", () => {
    expect(runner).toContain('process.argv.includes("--live")');
    expect(runner).toContain('run("codex", ["--version"]');
    expect(runner.indexOf("if (!explicitLive)")).toBeLessThan(runner.indexOf("await mkdtemp"));
  });
});
