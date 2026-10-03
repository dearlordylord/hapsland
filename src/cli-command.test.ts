import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = (args: ReadonlyArray<string>, input = "") => {
  const home = mkdtempSync(join(tmpdir(), "hapsland-cli-arguments-"));
  try {
    const result = spawnSync(process.execPath, ["src/cli.ts", ...args], {
      input, encoding: "utf8", timeout: 15_000,
      env: { ...process.env, HOME: home, HAPSLAND_ACTIVE_DISPATCH: "1", REVIEW_USER_CONFIG_PATH: join(home, "user.json"), REVIEW_STATE_PATH: join(home, "state"), REVIEW_ACTIVITY_PATH: join(home, "activity"), TYPESAFE_API_KEY: "", REVIEW_CONTROL_JSON: "not JSON" },
    });
    return { ...result, files: readdirSync(home) };
  } finally { rmSync(home, { recursive: true, force: true }); }
};

describe("declarative CLI subprocess contracts", () => {
  it.each([
    ["unknown"], ["--unknown"], ["update", "--chanel=next"], ["setup", "--claude-home="],
    ["setup", "--claude-home", ""], ["setup", "--host"], ["update", "--host", "--channel=next"],
    ["update", "claude", "--host=codex"], ["update", "codex", "claude"],
    ["update", "--host=claude", "--host", "codex"], ["update", "--channel=next", "--channel", "latest"],
    ["update", "--target=/tmp/x", "--version=0.1.0"], ["update", "--tarball=/tmp/x", "--channel=next"],
    ["update", "--channel=other"], ["doctor", "--tarball=/tmp/x"], ["uninstall", "--target=/tmp/x"],
    ["--pilot", "--json"], ["--login", "--logout"], ["--login", "--login"], ["--status", "--explain"], ["--credential-stdin"],
    ["--login", "doctor"], ["--target=/tmp/x", "setup"],
  ])("rejects invalid arguments before reading stdin or changing files: %j", (...args) => {
    const result = cli(args, "not JSON");
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(6);
    expect(result.stdout).toBe("");
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.stderr.length).toBeLessThan(1500);
    expect(result.files).toEqual([]);
  });
  it.each(["x".repeat(10_000), "--" + "x".repeat(10_000)])("bounds long invalid command or option errors", argument => {
    const result = cli([argument], "not JSON");
    expect(result.status).toBe(6);
    expect(result.stdout).toBe("");
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.stderr.length).toBeLessThanOrEqual(1401);
    expect(result.files).toEqual([]);
  });
  it.each(["setup", "update", "doctor", "repair", "reinstall", "uninstall"])("generates command-specific %s help", command => {
    const result = cli([command, "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`hapsland ${command}`);
    expect(result.stdout).toContain("--host");
    expect(result.stderr).toBe("");
    expect(result.files).toEqual([]);
  });
  it.each([
    ["--claude-hook", "--help"], ["--claude-hook=true", "--help"], ["--composed-edit-hook", "--help"], ["--codex-hook", "--help"], ["--opencode-hook", "--help"],
    ["--composed-stop-hook", "--help"], ["--claude-hook", "--unknown"], ["--composed-background-hook", "--codex-version="],
    ["--claude-hook", "--codex-hook"], ["--codex-hook", "--login"],
  ])("keeps hook help and invalid arguments quiet: %j", (...args) => {
    const result = cli(args, "not JSON");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.files).toEqual([]);
  });
  it.each([["--composed-host=codex-cli", "--codex-version=0.156.0", "--review-tool-owned=codex-v1"], ["--composed-host", "codex-cli", "--codex-version", "0.156.0", "--review-tool-owned", "codex-v1"]])("accepts both hook flag-value spellings: %j", (...args) => {
    const result = cli(["--codex-hook", ...args], "not JSON");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stderr).toBe("");
    expect(result.files).toEqual([]);
  });
  it.each([["--host=codex", "--codex-home=/tmp/hapsland-missing-profile"], ["--host", "codex", "--codex-home", "/tmp/hapsland-missing-profile"]])("accepts both lifecycle flag-value spellings: %j", (...args) => {
    const result = cli(["setup", ...args]);
    expect(result.status).toBe(6);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Guided setup needs a terminal");
    expect(result.files).toEqual([]);
  });
  it("preserves positional client selection for the guided --pilot entry point", () => {
    const result = cli(["--pilot", "claude"]);
    expect(result.status).toBe(6);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Guided setup needs a terminal");
    expect(result.files).toEqual([]);
  });
  it.each([["--channel=next", "--version=0.1.0"], ["--channel", "next", "--version", "0.1.0"]])("preserves release version as a lifecycle value rather than a CLI action: %j", (...args) => {
    const result = cli(["update", "codex", ...args]);
    expect(result.status).toBe(6);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Interactive update needs a terminal");
    expect(result.files).toEqual([]);
  });
  it("accepts an installed composed hook ownership marker before quieting unsupported input", () => {
    const result = cli(["--composed-stop-hook", "--composed-host=claude-code", "--review-tool-composed-owned=claude-v1"], "not JSON");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stderr).toBe("");
  });
  it("allows JSON automation to select evaluation operation independently of the live opt-in", () => {
    const result = cli(["--evaluation-live"], JSON.stringify({ version: 1, operation: "run" }));
    expect(JSON.parse(result.stdout)).toMatchObject({ version: 1, operation: "run", status: "complete" });
    expect(result.stderr).toBe("");
    expect(result.files).toEqual([]);
  });
  it("keeps machine-readable package identity stdout stable", () => {
    const result = cli(["--package-identity"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ name: "@hapsland/hapsland", runtime: process.execPath });
    expect(result.stderr).toBe("");
    expect(result.files).toEqual([]);
  });
});


it.each(["repair", "reinstall", "uninstall"])("rejects interactive %s without a terminal", command => {
  const result = cli([command, "codex"]);
  expect(result.status).toBe(6);
  expect(result.stderr).toContain(`${command} needs a terminal`);
  expect(result.files).toEqual([]);
});


it.each([
  { host: "claude", homeField: "claudeHome", executableField: "claudeExecutable" },
  { host: "opencode", homeField: "opencodeConfigHome", executableField: "opencodeExecutable" },
])("routes the version-one $host installation preview to the selected profile", ({ host, homeField, executableField }) => {
  const profile = mkdtempSync(join(tmpdir(), "hapsland-preview-profile-"));
  try {
    const result = cli(["--install-preview"], JSON.stringify({ version: 1, operation: "install-preview", host,
      [homeField]: profile, [executableField]: join(profile, "missing-client"),
    }));
    const output = JSON.parse(result.stdout);
    expect(output.operation).toBe("install-preview");
    expect(output.error?.code).not.toBe("invalid_request");
    if (host === "opencode") {
      expect(output.status).toBe("unsupported");
      expect(output.host.adapter).toBe("opencode");
    } else {
      expect(JSON.stringify(output)).toContain(profile);
    }
    expect(readdirSync(profile)).toEqual([]);
  } finally { rmSync(profile, { recursive: true, force: true }); }
});
