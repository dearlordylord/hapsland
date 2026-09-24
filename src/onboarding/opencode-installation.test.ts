import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diagnoseOpenCodeIntegration, installOpenCodeIntegration, previewOpenCodeInstallation,
  previewOpenCodeUpdate, uninstallOpenCodeIntegration, updateOpenCodeIntegration } from "./opencode-installation.ts";

const dirs: string[] = [];
const fixture = () => {
  const temp = mkdtempSync(join(tmpdir(), "hapsland-opencode-install-"));
  dirs.push(temp);
  const home = join(temp, "config");
  const host = join(temp, "opencode");
  const entrypoint = join(temp, "cli.js");
  writeFileSync(host, "#!/bin/sh\necho 1.14.44\n", { mode: 0o755 });
  writeFileSync(entrypoint, "process.exit(0)\n");
  process.env.REVIEW_INSTALL_ENTRYPOINT = entrypoint;
  return { home, host, request: { opencodeConfigHome: home, opencodeExecutable: host } };
};
afterEach(() => {
  delete process.env.REVIEW_INSTALL_ENTRYPOINT;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("OpenCode owned plugin installation", () => {
  it("previews, installs, updates, diagnoses, and removes only the owned plugin", async () => {
    const { home, request } = fixture();
    mkdirSync(join(home, "plugins"), { recursive: true });
    writeFileSync(join(home, "plugins", "other.mjs"), "export const Other = async () => ({});\n");
    const proposal = previewOpenCodeInstallation(request);
    expect(proposal.status).toBe("preview");
    if (proposal.status !== "preview") return;
    expect((await installOpenCodeIntegration({ ...request, proposalDigest: proposal.proposal.digest })).status).toBe("complete");
    expect(readFileSync(join(home, "plugins", "other.mjs"), "utf8")).toContain("Other");
    expect(diagnoseOpenCodeIntegration(request).checks.find((check) => check.stage === "configuration-ownership")?.status).toBe("ready");
    const update = previewOpenCodeUpdate(request);
    expect(update.status).toBe("preview");
    if (update.status !== "preview") return;
    expect((await updateOpenCodeIntegration({ ...request, proposalDigest: update.proposal.digest })).status).toBe("already-current");
    const removal = await uninstallOpenCodeIntegration(request);
    expect(removal.status).toBe("preview");
    if (removal.status !== "preview") return;
    expect((await uninstallOpenCodeIntegration({ ...request, proposalDigest: removal.proposal.digest })).status).toBe("complete");
    expect(readFileSync(join(home, "plugins", "other.mjs"), "utf8")).toContain("Other");
  });

  it("refuses a modified owned file and never removes it", async () => {
    const { home, request } = fixture();
    const proposal = previewOpenCodeInstallation(request);
    if (proposal.status !== "preview") throw new Error("preview unavailable");
    await installOpenCodeIntegration({ ...request, proposalDigest: proposal.proposal.digest });
    const plugin = join(home, "plugins", "hapsland.mjs");
    writeFileSync(plugin, "modified\n");
    expect((await uninstallOpenCodeIntegration(request)).status).toBe("conflict");
    expect(readFileSync(plugin, "utf8")).toBe("modified\n");
  });
});
