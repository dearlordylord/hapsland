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

const evaluation = read("src/evaluation/command.ts");
if (/Effect\.run(?:Sync|Promise|Fork)\(/u.test(evaluation) || evaluation.includes("process.env")) {
  throw new Error("evaluation planning must share the caller Effect runtime and ConfigProvider");
}
if (!evaluation.includes("Config.Redacted(name)")) {
  throw new Error("evaluation credential presence must be read through redacted Effect Config");
}

const credentials = read("src/credentials/secret-service.ts");
if (/Effect\.run(?:Sync|Promise|Fork)\(|new Promise|\basync\b|setTimeout\(/u.test(credentials)) {
  throw new Error("credential workflows must compose in the caller Effect runtime");
}
if (/process\.env(?:\[|\.REVIEW_CREDENTIAL_)/u.test(credentials) ||
    !credentials.includes("Config.Redacted(options.envVar)") ||
    !credentials.includes('Schedule.spaced("10 millis")')) {
  throw new Error("credential configuration and lock polling must use redacted Config and Schedule");
}

const installationLock = read("src/onboarding/installation-lock.ts");
if (/Effect\.run(?:Sync|Promise|Fork)\(|new Promise|\basync\b|setTimeout\(|Date\.now\(|process\.env/u.test(installationLock) ||
    !installationLock.includes('Schedule.spaced("25 millis")') ||
    !installationLock.includes("Effect.acquireUseRelease(")) {
  throw new Error("installation lock must share caller Config/Clock, Schedule polling and scoped ownership");
}
for (const runtime of ["codex", "claude", "opencode"]) {
  const source = read(`src/onboarding/${runtime}-installation.ts`);
  if (/export const (?:install|update|uninstall)\w+Integration\s*=\s*async\b|Effect\.run(?:Sync|Promise|Fork)\(/u.test(source)) {
    throw new Error(`${runtime} installation mutation APIs must compose in the caller Effect runtime`);
  }
}

const doctor = read("src/onboarding/doctor.ts");
if (/Effect\.run(?:Sync|Promise|Fork)\(|\basync\b|process\.env/u.test(doctor) ||
    !doctor.includes("yield* inspectResident()")) {
  throw new Error("installed doctor must inspect the resident in the caller Effect runtime and configuration");
}

const demo = read("src/onboarding/first-review-demo.ts");
if (/Effect\.run(?:Sync|Promise|Fork)\(|\basync\b|Effect\.promise\(|new Promise|setTimeout\(|Date\.now\(/u.test(demo) ||
    !demo.includes('Schedule.spaced("250 millis")') || !demo.includes("Effect.scoped")) {
  throw new Error("demo workflows must compose in the caller runtime with scheduled observation and scoped cleanup");
}
for (const key of ["REVIEW_ACTIVITY_PATH", "REVIEW_DEMO_TEST_SANDBOX_BYPASS", "REVIEW_DEMO_TEST_CODEX_MODEL"]) {
  if (demo.includes(`process.env.${key}`)) throw new Error(`demo configuration bypass returned: ${key}`);
}
const host = read("src/onboarding/codex-host-process.ts");
if (/new Promise|Effect\.run(?:Sync|Promise|Fork)\(/u.test(host) || !host.includes("Effect.acquireUseRelease(")) {
  throw new Error("native Codex host process must use scoped Effect ownership");
}
