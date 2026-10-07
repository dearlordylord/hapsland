import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
for (const path of [
  "packages/cli-entry/src/cli.ts",
  "packages/administration/src/onboarding/setup.ts",
  "packages/administration/src/onboarding/first-review-demo.ts",
  "packages/review-execution/src/direct-event/pipeline.ts",
  "packages/resident-runtime/src/resident/server.ts"
]) {
  const source = read(path)
  if (/\bconsent\.(authorize|enable|disable|preview|list)\s*\(/.test(source)) {
    throw new Error(`retired repository grant call returned to ${path}`)
  }
}
for (const [path, call] of [
  ["packages/runtime-inputs/src/configuration/resolve.ts", "replaceIncludes("],
  ["packages/native-observation/src/policy/file-policy.ts", "selectFile("],
  ["packages/native-observation/src/direct-event/selection.ts", "selectFile("],
  ["packages/review-execution/src/direct-event/pipeline.ts", "admitReview("],
  ["packages/resident-runtime/src/resident/server.ts", "admitReview("]
]) {
  if (!read(path).includes(call)) throw new Error(`canonical configuration route missing: ${path}`)
}

if (read("packages/resident-runtime/src/resident/server.ts").includes("process.env")) {
  throw new Error("resident runtime configuration must use Effect Config")
}
const client = read("packages/resident-transport/src/resident/client.ts")
for (const access of [
  "process.env[settings.credentialEnvVar]",
  "process.env.REVIEW_CREDENTIAL_STATE_PATH",
  "process.env.REVIEW_DEMO_BUDGET_PATH"
]) {
  if (client.includes(access)) throw new Error(`resident dispatch configuration bypass returned: ${access}`)
}
const credentialInput = read("packages/runtime-inputs/src/credentials/input.ts")
if (
  !client.includes("resolveCredentialInput({ envVar: capture.policy.credentialEnvVar.value, root })") ||
  !client.includes("Redacted.value(credentialInput.value)") ||
  !credentialInput.includes("readonly value?: Redacted.Redacted") ||
  !credentialInput.includes("Config.Redacted(options.envVar)") ||
  credentialInput.includes("Redacted.value(") ||
  credentialInput.includes("process.env")
) {
  throw new Error("resident dispatch credential configuration must remain redacted until IPC construction")
}

const evaluation = read("packages/administration/src/evaluation/command.ts")
if (/Effect\.run(?:Sync|Promise|Fork)\(/u.test(evaluation) || evaluation.includes("process.env")) {
  throw new Error("evaluation planning must share the caller Effect runtime and ConfigProvider")
}
if (!evaluation.includes("Config.Redacted(name)")) {
  throw new Error("evaluation credential presence must be read through redacted Effect Config")
}

const credentials = read("packages/credential-storage/src/credentials/secret-service.ts")
if (/Effect\.run(?:Sync|Promise|Fork)\(|new Promise|\basync\b|setTimeout\(/u.test(credentials)) {
  throw new Error("credential workflows must compose in the caller Effect runtime")
}
if (
  /process\.env(?:\[|\.REVIEW_CREDENTIAL_)/u.test(credentials) ||
  !credentials.includes("yield* resolveCredentialInput(options)") ||
  !credentials.includes('Schedule.spaced("10 millis")')
) {
  throw new Error("credential configuration and lock polling must use redacted Config and Schedule")
}

const installationLock = read("packages/administration/src/onboarding/installation-lock.ts")
for (const path of [
  "packages/administration/src/onboarding/installation-lock.ts",
  "packages/credential-storage/src/credentials/secret-service.ts",
  "packages/administration/src/onboarding/first-review-demo.ts",
  "packages/resident-transport/src/resident/client.ts"
]) {
  if (/Clock\.currentTimeNanos/u.test(read(path))) {
    throw new Error(`${path} elapsed budgets must use monotonicTimeNanos, not wall-clock nanos`)
  }
}
for (const path of [
  "packages/hook-runtime/src/hooks/program.ts",
  "packages/resident-transport/src/resident/client.ts",
  "packages/hook-runtime/src/resident/composed-hook.ts",
  "packages/hook-runtime/src/resident/hook-output.ts"
]) {
  if (/performance\.now\(/u.test(read(path))) {
    throw new Error(`${path} hook deadline consumers must share the caller monotonic Clock coordinate`)
  }
}
if (
  /Effect\.run(?:Sync|Promise|Fork)\(|new Promise|\basync\b|setTimeout\(|Date\.now\(|process\.env/u.test(
    installationLock
  ) ||
  !installationLock.includes('Schedule.spaced("25 millis")') ||
  !installationLock.includes("Effect.acquireUseRelease(")
) {
  throw new Error("installation lock must share caller Config/Clock, Schedule polling and scoped ownership")
}
for (const runtime of ["codex", "claude", "opencode"]) {
  const source = read(`packages/administration/src/onboarding/${runtime}-installation.ts`)
  if (
    /export const (?:install|update|uninstall)\w+Integration\s*=\s*async\b|Effect\.run(?:Sync|Promise|Fork)\(/u.test(
      source
    )
  ) {
    throw new Error(`${runtime} installation mutation APIs must compose in the caller Effect runtime`)
  }
}

const claudeInstallation = read("packages/administration/src/onboarding/claude-installation.ts")
if (
  /spawnSync\(|process\.env(?:\.|\[)/u.test(claudeInstallation) ||
  !claudeInstallation.includes('Config.NonEmptyString("REVIEW_INSTALL_RUNTIME")') ||
  !claudeInstallation.includes('Config.NonEmptyString("REVIEW_INSTALL_ENTRYPOINT")') ||
  !claudeInstallation.includes("yield* execFileClosedStdin(")
) {
  throw new Error("Claude installation must use caller Config and scoped native host processes")
}

const codexInstallation = read("packages/administration/src/onboarding/codex-installation.ts")
if (
  /spawnSync\(|process\.env(?:\.|\[)/u.test(codexInstallation) ||
  !codexInstallation.includes('Config.NonEmptyString("CODEX_HOME")') ||
  !codexInstallation.includes('Config.NonEmptyString("REVIEW_INSTALL_RUNTIME")') ||
  !codexInstallation.includes('Config.NonEmptyString("REVIEW_INSTALL_ENTRYPOINT")') ||
  !codexInstallation.includes("yield* execFileClosedStdin(")
) {
  throw new Error("Codex installation must use caller Config and scoped native host processes")
}

const clientLifecycle = read("packages/administration/src/onboarding/client-lifecycle.ts")
if (
  /spawnSync\(|Effect\.run(?:Sync|Promise|Fork)\(|process\.env(?:\.|\[)/u.test(clientLifecycle) ||
  !clientLifecycle.includes('Config.NonEmptyString("HAPSLAND_ACTIVE_DISPATCH")') ||
  !clientLifecycle.includes("yield* spawnInherited(")
) {
  throw new Error("package lifecycle must compose caller Config and scoped inherited processes")
}
const distribution = read("packages/administration/src/onboarding/distribution.ts")
if (
  /spawnSync\(|Effect\.run(?:Sync|Promise|Fork)\(|\basync\b/u.test(distribution) ||
  !distribution.includes("yield* execFileClosedStdin(")
) {
  throw new Error("release staging must compose scoped native process Effects")
}
for (const path of [
  "packages/review-definition/src/rules/loader.ts",
  "packages/runtime-inputs/src/configuration/load.ts"
]) {
  if (/\basync\b|Effect\.run(?:Sync|Promise|Fork)\(/u.test(read(path))) {
    throw new Error(`${path} must compose Effects directly without an async facade`)
  }
}
for (const path of [
  "packages/native-observation/src/repository/root.ts",
  "packages/native-observation/src/direct-event/adapter.ts",
  "packages/native-observation/src/direct-event/selection.ts",
  "packages/native-observation/src/hosts/opencode/adapter.ts"
]) {
  if (/\basync\b|promisify\(execFile\)|Effect\.run(?:Sync|Promise|Fork)\(/u.test(read(path))) {
    throw new Error(`${path} Git observations must compose scoped Effect process adapters`)
  }
}
const capture = read("packages/native-observation/src/direct-event/capture.ts")
const captureWorkflow = capture.slice(capture.indexOf("export const captureStable"))
if (
  /\basync\b|Effect\.tryPromise\(\{\s*try:\s*async/u.test(captureWorkflow) ||
  !captureWorkflow.includes("Effect.acquireUseRelease(") ||
  !capture.includes("execFileClosedStdinBuffer") ||
  !capture.includes("Effect.uninterruptible")
) {
  throw new Error("stable capture must scope native reads and buffers without an async workflow facade")
}

const doctor = read("packages/administration/src/onboarding/doctor.ts")
if (
  /Effect\.run(?:Sync|Promise|Fork)\(|\basync\b|process\.env/u.test(doctor) ||
  !doctor.includes("yield* inspectResident()")
) {
  throw new Error("installed doctor must inspect the resident in the caller Effect runtime and configuration")
}

const demo = read("packages/administration/src/onboarding/first-review-demo.ts")
if (
  /Effect\.run(?:Sync|Promise|Fork)\(|\basync\b|Effect\.promise\(|new Promise|setTimeout\(|Date\.now\(/u.test(demo) ||
  !demo.includes('Schedule.spaced("250 millis")') ||
  !demo.includes("Effect.scoped")
) {
  throw new Error("demo workflows must compose in the caller runtime with scheduled observation and scoped cleanup")
}
for (const key of ["REVIEW_ACTIVITY_PATH", "REVIEW_DEMO_TEST_SANDBOX_BYPASS", "REVIEW_DEMO_TEST_CODEX_MODEL"]) {
  if (demo.includes(`process.env.${key}`)) throw new Error(`demo configuration bypass returned: ${key}`)
}
for (const host of [
  read("packages/administration/src/onboarding/host-process.ts"),
  read("packages/runtime-environment/src/process/closed-stdin.ts")
]) {
  if (/new Promise|Effect\.run(?:Sync|Promise|Fork)\(/u.test(host) || !host.includes("Effect.acquireUseRelease(")) {
    throw new Error("host processes must use scoped Effect ownership")
  }
}

const maskedInput = read("packages/administration/src/credentials/masked-input.ts")
if (
  /new Promise|\basync\b|setInterval\(|setTimeout\(|spawnSync\(|Effect\.run(?:Sync|Promise|Fork)\(/u.test(
    maskedInput
  ) ||
  !maskedInput.includes("Effect.acquireUseRelease(") ||
  !maskedInput.includes("Schedule.fromStep(") ||
  !maskedInput.includes("execFileClosedStdin(")
) {
  throw new Error(
    "masked credential input must use scoped Effect ownership, scheduled polling and scoped native processes"
  )
}
const clientSelection = read("packages/administration/src/onboarding/client-selection.ts")
if (
  /new Promise|\basync\b|Effect\.run(?:Sync|Promise|Fork)\(/u.test(clientSelection) ||
  !clientSelection.includes("Effect.acquireUseRelease(")
) {
  throw new Error("interactive client selection must use caller Effect runtime and scoped terminal ownership")
}

const interactiveCli = read("packages/cli-entry/src/cli.ts")
if (/new Promise|setInterval\(|spawnSync\(|\basync\b|process\.env(?:\.|\[)/u.test(interactiveCli)) {
  throw new Error("CLI workflows must compose Effects and use scoped native adapters")
}
const packageDoctor = read("packages/doctor-entry/src/package-doctor.ts")
const packageDiagnostics = read("packages/administration/src/onboarding/package-diagnostics.ts")
if (
  /execFileSync\(|spawnSync\(/u.test(packageDoctor + packageDiagnostics) ||
  !packageDoctor.includes(
    'import { diagnosePackage } from "@hapsland/administration/onboarding/package-diagnostics"'
  ) ||
  !packageDoctor.includes("Effect.runPromise(diagnosePackage())") ||
  !packageDiagnostics.includes('Effect.fn("PackageDoctor.inspect")') ||
  !packageDiagnostics.includes("Effect.scoped") ||
  /Effect\.run(?:Sync|Promise|Fork)\(/u.test(packageDiagnostics) ||
  !packageDiagnostics.includes("execFileClosedStdin(")
) {
  throw new Error("package doctor must scope its native compatibility subprocesses")
}
for (const workflow of [
  "pilotSetup",
  "chooseSetupClients",
  "updateInteractive",
  "maintenanceInteractive",
  "diagnoseClientProcess"
]) {
  if (!new RegExp(`const ${workflow} = Effect\\.fn\\(`, "u").test(interactiveCli)) {
    throw new Error(`${workflow} must be a named Effect workflow`)
  }
}
const confirmation = read("packages/administration/src/onboarding/confirmation.ts")
if (
  /new Promise|\basync\b|Effect\.run(?:Sync|Promise|Fork)\(/u.test(confirmation) ||
  !confirmation.includes("Effect.acquireUseRelease(")
) {
  throw new Error("confirmation must own readline acquisition and closure in caller Effect runtime")
}
