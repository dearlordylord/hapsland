import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  diagnoseClaudeIntegration, inspectClaudeInstallation, installClaudeIntegration,
  previewClaudeInstallation, previewClaudeUpdate, uninstallClaudeIntegration, updateClaudeIntegration,
} from "./claude-installation.ts";

const roots: string[] = [];
afterEach(() => {
  delete process.env.REVIEW_INSTALL_RUNTIME;
  delete process.env.REVIEW_INSTALL_ENTRYPOINT;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fixture = (version = "2.1.218") => {
  const root = mkdtempSync(join(tmpdir(), "claude installation ' "));
  roots.push(root);
  const home = join(root, "custom .claude");
  mkdirSync(home);
  const claudeExecutable = join(root, "claude fake");
  writeFileSync(claudeExecutable, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`);
  chmodSync(claudeExecutable, 0o700);
  const entrypoint = join(root, "cli.js");
  writeFileSync(entrypoint, "process.stdin.resume();\n");
  process.env.REVIEW_INSTALL_RUNTIME = process.execPath;
  process.env.REVIEW_INSTALL_ENTRYPOINT = entrypoint;
  return { root, home, claudeExecutable };
};

const settings = (home: string) => JSON.parse(readFileSync(join(home, "settings.json"), "utf8")) as Record<string, unknown>;
const digestOf = (preview: object) => {
  const proposal = (preview as { proposal?: { digest: string } }).proposal;
  expect(proposal?.digest).toMatch(/^[a-f0-9]{64}$/);
  return proposal!.digest;
};

describe("Claude installation lifecycle", () => {
  it("previews a pinned host, preserves unrelated settings, and removes only its owned hook", async () => {
    const { home, claudeExecutable } = fixture();
    const original = { permissions: { allow: ["Read"] }, hooks: {
      PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "other-tool" }] }],
      Stop: [{ hooks: [{ type: "command", command: "stop-tool" }] }],
    } };
    writeFileSync(join(home, "settings.json"), JSON.stringify(original));
    const request = { claudeHome: home, claudeExecutable };
    const preview = previewClaudeInstallation(request);
    expect(preview.status).toBe("preview");
    expect(preview).not.toHaveProperty("sourceEgressAuthorized");
    expect(settings(home)).toEqual(original);
    expect((await installClaudeIntegration({ ...request, proposalDigest: digestOf(preview) })).status).toBe("complete");
    const installed = settings(home);
    expect(installed.permissions).toEqual(original.permissions);
    const installedHooks = installed.hooks as typeof original.hooks & { PreToolUse: unknown[]; UserPromptSubmit: unknown[]; SubagentStop: unknown[] };
    expect(installedHooks.PreToolUse).toHaveLength(1);
    expect(JSON.stringify(installedHooks.PreToolUse)).toContain("exec ");
    expect(JSON.stringify(installedHooks.PreToolUse)).toContain("--composed-before-edit-hook");
    expect(installedHooks.Stop[0]).toEqual(original.hooks.Stop[0]);
    expect(installedHooks.Stop).toHaveLength(2);
    expect(JSON.stringify(installedHooks.Stop[1])).toContain("--composed-stop-hook");
    expect(JSON.stringify(installedHooks.UserPromptSubmit)).toContain("--composed-prompt-hook");
    expect(installedHooks.SubagentStop).toHaveLength(1);
    expect(JSON.stringify(installedHooks.SubagentStop)).toContain("--composed-stop-hook");
    const post = (installed.hooks as typeof original.hooks).PostToolUse;
    expect(post[0]).toEqual(original.hooks.PostToolUse[0]);
    expect(post).toHaveLength(2);
    expect(JSON.stringify(post[1])).toContain("--claude-hook");
    expect(JSON.stringify(post[1])).toContain("--composed-background-hook");
    expect(JSON.stringify(post[1])).toContain("--review-tool-owned=claude-v1");
    expect((inspectClaudeInstallation(request) as { installed?: boolean }).installed).toBe(true);
    const removal = await uninstallClaudeIntegration(request);
    expect(removal.status).toBe("preview");
    expect((await uninstallClaudeIntegration({ ...request, proposalDigest: digestOf(removal) })).status).toBe("complete");
    expect(settings(home)).toEqual(original);
    expect((inspectClaudeInstallation(request) as { installed?: boolean }).installed).toBe(false);
  });

  it("updates an older owned installation to add SubagentStop", async () => {
    const { home, claudeExecutable } = fixture();
    const request = { claudeHome: home, claudeExecutable };
    await installClaudeIntegration({ ...request, proposalDigest: digestOf(previewClaudeInstallation(request)) });
    const previous = settings(home);
    delete (previous.hooks as Record<string, unknown>).SubagentStop;
    writeFileSync(join(home, "settings.json"), JSON.stringify(previous));
    const recordPath = join(home, ".realtime-review-tool", "claude-installation-v1.json");
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as { composed: { subagentStopDigest?: string } };
    delete record.composed.subagentStopDigest;
    writeFileSync(recordPath, JSON.stringify(record));
    const proposal = previewClaudeUpdate(request);
    expect(proposal.status).toBe("preview");
    expect((await updateClaudeIntegration({ ...request, proposalDigest: digestOf(proposal) })).status).toBe("complete");
    expect((settings(home).hooks as Record<string, unknown>).SubagentStop).toBeDefined();
  });

  it("requires the exact tested host profile and an approval digest", async () => {
    const { home, claudeExecutable } = fixture("2.1.219");
    const request = { claudeHome: home, claudeExecutable };
    expect(previewClaudeInstallation(request).status).toBe("unsupported");
    expect((await installClaudeIntegration({ ...request, proposalDigest: "0".repeat(64) })).status).toBe("unsupported");
    expect((inspectClaudeInstallation(request) as { installed?: boolean }).installed).toBe(false);
    expect(diagnoseClaudeIntegration(request).checks.find((check) => check.stage === "host")?.status).toBe("unsupported");
  });

  it("detects concurrent settings edits and locally modified owned entries", async () => {
    const { home, claudeExecutable } = fixture();
    const request = { claudeHome: home, claudeExecutable };
    const proposal = previewClaudeInstallation(request);
    writeFileSync(join(home, "settings.json"), JSON.stringify({ custom: true }));
    expect((await installClaudeIntegration({ ...request, proposalDigest: digestOf(proposal) })).status).toBe("proposal-mismatch");
    const current = previewClaudeInstallation(request);
    expect((await installClaudeIntegration({ ...request, proposalDigest: digestOf(current) })).status).toBe("complete");
    const changed = settings(home);
    const hooks = (changed.hooks as { PostToolUse: Array<{ matcher: string }> }).PostToolUse;
    hooks[0]!.matcher = "Write";
    writeFileSync(join(home, "settings.json"), JSON.stringify(changed));
    expect(inspectClaudeInstallation(request).status).toBe("conflict");
    expect((await uninstallClaudeIntegration(request)).status).toBe("conflict");
    expect(settings(home)).toEqual(changed);
  });

  it.each(["Stop", "SubagentStop"] as const)("rejects a locally modified owned %s hook", async (event) => {
    const { home, claudeExecutable } = fixture();
    const request = { claudeHome: home, claudeExecutable };
    await installClaudeIntegration({ ...request, proposalDigest: digestOf(previewClaudeInstallation(request)) });
    const changed = settings(home);
    const stop = (changed.hooks as Record<typeof event, Array<{ hooks: Array<{ timeout: number }> }>>)[event];
    stop[0]!.hooks[0]!.timeout = 3;
    writeFileSync(join(home, "settings.json"), JSON.stringify(changed));
    expect(inspectClaudeInstallation(request).status).toBe("conflict");
    expect((await uninstallClaudeIntegration(request)).status).toBe("conflict");
  });

  it("updates only the owned hook and keeps host trust separate from source egress", async () => {
    const { home, claudeExecutable, root } = fixture();
    const request = { claudeHome: home, claudeExecutable };
    const initial = previewClaudeInstallation(request);
    await installClaudeIntegration({ ...request, proposalDigest: digestOf(initial) });
    const replacement = join(root, "new-cli.js");
    writeFileSync(replacement, "process.stdin.resume();\n");
    process.env.REVIEW_INSTALL_ENTRYPOINT = replacement;
    const preview = previewClaudeUpdate(request);
    expect(preview.status).toBe("preview");
    expect((await updateClaudeIntegration({ ...request, proposalDigest: digestOf(preview) })).status).toBe("complete");
    expect(JSON.stringify(settings(home))).toContain("new-cli.js");
    expect((inspectClaudeInstallation(request) as { installed?: boolean }).installed).toBe(true);
    const doctor = diagnoseClaudeIntegration(request);
    expect(doctor.providerCalls).toBe(0);
    expect(doctor.checks.find((check) => check.stage === "native-trust")?.status).toBe("unknown");
    expect(doctor.checks.find((check) => check.stage === "file-selection")?.status).toBe("unknown");
  });
});
