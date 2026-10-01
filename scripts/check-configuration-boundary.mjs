import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
for (const path of ["src/cli.ts", "src/onboarding/setup.ts", "src/onboarding/first-review-demo.ts",
  "src/direct-event/pipeline.ts", "src/resident/server.ts"]) {
  const source = read(path);
  if (/\bconsent\.(authorize|enable|disable|preview|list)\s*\(/.test(source)) {
    throw new Error(`retired repository grant call returned to ${path}`);
  }
}
for (const [path, call] of [
  ["src/configuration/resolve.ts", "replaceIncludes("],
  ["src/policy/file-policy.ts", "selectFile("],
  ["src/direct-event/selection.ts", "selectFile("],
  ["src/direct-event/pipeline.ts", "admitReview("],
  ["src/resident/server.ts", "admitReview("],
]) {
  if (!read(path).includes(call)) throw new Error(`canonical configuration route missing: ${path}`);
}

if (read("src/resident/server.ts").includes("process.env")) {
  throw new Error("resident runtime configuration must use Effect Config");
}
const client = read("src/resident/client.ts");
for (const access of ["process.env[settings.credentialEnvVar]", "process.env.REVIEW_CREDENTIAL_STATE_PATH", "process.env.REVIEW_DEMO_BUDGET_PATH"]) {
  if (client.includes(access)) throw new Error(`resident dispatch configuration bypass returned: ${access}`);
}
if (!client.includes("Config.Redacted(settings.credentialEnvVar)")) {
  throw new Error("resident dispatch credential configuration must remain redacted until IPC construction");
}
