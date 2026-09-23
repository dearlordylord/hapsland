import { describe, expect, it } from "vitest";
import { execFileClosedStdin } from "./codex-host-process.ts";

describe("Codex host process", () => {
  it("closes stdin so a prompt argument can start without waiting for the deadline", async () => {
    const result = await execFileClosedStdin(process.execPath, [
      "-e", "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('ready'))",
    ], { env: process.env, timeout: 2_000, maxBuffer: 1_024 });
    expect(result.stdout).toBe("ready");
  });
});
