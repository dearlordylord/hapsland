import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const seedOwnedPlugin = (home: string) => {
  const plugin = "export const HapslandPlugin = async () => ({});\n";
  mkdirSync(join(home, "plugins"), { recursive: true });
  mkdirSync(join(home, ".realtime-review-tool"), { recursive: true });
  writeFileSync(join(home, "plugins", "hapsland.mjs"), plugin);
  writeFileSync(join(home, ".realtime-review-tool", "opencode-installation-v1.json"), JSON.stringify({
    version: 1, adapter: "opencode", home,
    pluginDigest: createHash("sha256").update(plugin).digest("hex"),
    runtime: process.execPath, entrypoint: process.env.REVIEW_INSTALL_ENTRYPOINT,
  }));
};

describe("OpenCode unsupported installation and owned cleanup", () => {
  it("blocks install and update previews and applications without writes", async () => {
    const { home, request } = fixture();
    expect(previewOpenCodeInstallation(request).status).toBe("unsupported");
    expect(previewOpenCodeUpdate(request).status).toBe("unsupported");
    expect((await installOpenCodeIntegration({ ...request, proposalDigest: "old-proposal" })).status).toBe("unsupported");
    expect((await updateOpenCodeIntegration({ ...request, proposalDigest: "old-proposal" })).status).toBe("unsupported");
    expect(existsSync(home)).toBe(false);
  });

  it("reports not-ready for an existing owned installation and permits its removal", async () => {
    const { home, request } = fixture();
    seedOwnedPlugin(home);
    writeFileSync(join(home, "plugins", "other.mjs"), "other plugin");
    const doctor = diagnoseOpenCodeIntegration(request);
    expect(doctor.status).toBe("not-ready");
    expect(doctor.checks.find((check) => check.stage === "pre-edit-permit")?.status).toBe("unsupported");
    const removal = await uninstallOpenCodeIntegration(request);
    expect(removal.status).toBe("preview");
    if (removal.status !== "preview") throw new Error("removal preview unavailable");
    expect((await uninstallOpenCodeIntegration({ ...request, proposalDigest: removal.proposal.digest })).status).toBe("complete");
    expect(existsSync(join(home, "plugins", "hapsland.mjs"))).toBe(false);
    expect(readFileSync(join(home, "plugins", "other.mjs"), "utf8")).toBe("other plugin");
  });

  it("refuses a modified owned file and never removes it", async () => {
    const { home, request } = fixture();
    seedOwnedPlugin(home);
    const plugin = join(home, "plugins", "hapsland.mjs");
    writeFileSync(plugin, "modified\n");
    expect((await uninstallOpenCodeIntegration(request)).status).toBe("conflict");
    expect(readFileSync(plugin, "utf8")).toBe("modified\n");
  });
});
