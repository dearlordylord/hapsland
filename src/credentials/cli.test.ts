import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("public credential CLI", () => {
  it("logs in from explicit stdin without exposing the value and reports the surviving environment override on logout", () => {
    const root = mkdtempSync(join(tmpdir(), "credential-cli-"));
    const helper = join(root, "helper.mjs");
    const vault = join(root, "vault");
    const state = join(root, "state.json");
    const marker = "synthetic-cli-secret-marker";
    const entrypoint = join(process.cwd(), "src", "cli.ts");
    spawnSync("git", ["init", "--quiet"], { cwd: root });
    writeFileSync(join(root, ".review.jsonc"), '{"version":1,"credentialEnvVar":"ALT_KEY"}\n');
    writeFileSync(helper, `#!/usr/bin/env node
import { existsSync, rmSync, writeFileSync } from "node:fs";
const operation = process.argv[2]; const vault = process.env.TEST_SECRET_VAULT;
if (operation === "probe") console.log('{"version":1,"status":"available"}');
else if (operation === "set") { const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk); writeFileSync(vault, Buffer.concat(chunks), {mode:0o600}); console.log('{"version":1,"status":"stored"}'); }
else if (operation === "delete") { const found=existsSync(vault); rmSync(vault,{force:true}); console.log(JSON.stringify({version:1,status:found?"deleted":"missing"})); }
`);
    chmodSync(helper, 0o700);
    const environment: Record<string, string | undefined> = {
      ...process.env,
      REVIEW_CREDENTIAL_HELPER: helper,
      REVIEW_CREDENTIAL_STATE_PATH: state,
      TEST_SECRET_VAULT: vault,
    };
    delete environment.TYPESAFE_API_KEY;
    const login = spawnSync(process.execPath, [entrypoint, "--login", "--credential-stdin"], {
      cwd: root, env: environment, input: `${marker}\n`, encoding: "utf8",
    });
    expect(login.status).toBe(0);
    expect(JSON.parse(login.stdout)).toMatchObject({
      operation: "login", status: "stored", stored: true, paidVerificationPerformed: false,
    });
    expect(`${login.stdout}${login.stderr}`).not.toContain(marker);

    const logout = spawnSync(process.execPath, [entrypoint, "--logout"], {
      cwd: root, env: { ...environment, ALT_KEY: "surviving-environment-marker" }, encoding: "utf8",
    });
    expect(logout.status).toBe(0);
    expect(JSON.parse(logout.stdout)).toMatchObject({
      operation: "logout",
      status: "logged-out",
      grantsPreserved: true,
      sentRequestsRecalled: false,
      environmentOverride: { envVar: "ALT_KEY", active: true },
    });
    expect(`${logout.stdout}${logout.stderr}`).not.toContain("surviving-environment-marker");
  });
});
