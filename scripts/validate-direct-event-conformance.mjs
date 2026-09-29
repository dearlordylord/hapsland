import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("../", import.meta.url).pathname);
const manifestPath = resolve(root, "conformance/direct-event-v1.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const fail = (message) => {
  process.stderr.write(`direct-event conformance invalid: ${message}\n`);
  process.exitCode = 1;
};

if (manifest.schemaVersion !== 1 || manifest.ordinaryTests !== "deterministic-offline") {
  fail("manifest identity or offline policy is missing");
}
if (!Array.isArray(manifest.groups) || manifest.groups.length !== 12) {
  fail("exactly twelve acceptance groups are required");
}
const numbers = manifest.groups?.map((group) => group.group) ?? [];
if (numbers.join(",") !== "1,2,3,4,5,6,7,8,9,10,11,12") {
  fail("acceptance groups must be complete and ordered");
}

const references = new Set();
let obligationCount = 0;
let checkCount = 0;
for (const group of manifest.groups ?? []) {
  if (typeof group.boundary !== "string" || group.boundary.length === 0 || !Array.isArray(group.obligations) || group.obligations.length === 0) {
    fail(`group ${group.group} has no boundary or obligations`);
    continue;
  }
  for (const obligation of group.obligations) {
    obligationCount += 1;
    if (typeof obligation.id !== "string" || typeof obligation.policy !== "string" || obligation.policy.length === 0 || !Array.isArray(obligation.checks) || obligation.checks.length === 0) {
      fail(`group ${group.group} has a malformed obligation`);
      continue;
    }
    for (const check of obligation.checks) {
      checkCount += 1;
      if (!Array.isArray(check) || check.length !== 2) {
        fail(`obligation ${obligation.id} has a malformed check`);
        continue;
      }
      const [file, title] = check;
      const reference = `${file}\0${title}`;
      if (references.has(reference)) fail(`duplicate check reference: ${file}: ${title}`);
      references.add(reference);
      const content = await readFile(resolve(root, file), "utf8").catch(() => undefined);
      if (content === undefined) fail(`obligation ${obligation.id} references missing ${file}`);
      else if (!content.includes(`\"${title}\"`)) fail(`obligation ${obligation.id} references missing check: ${title}`);
    }
  }
}

const evidenceDirectory = resolve(root, "evidence/direct-event-v1");
const evidenceFiles = await readdir(evidenceDirectory).catch(() => []);
const forbiddenKeys = new Set([
  "additionalContext", "advice", "answer", "answers", "command", "content",
  "credential", "credentials", "input", "output", "patch", "probability",
  "probabilities", "prompt", "providerUsage", "rawResponse", "response", "source",
  "toolInput", "toolResponse", "transcript", "usage",
]);
const forbiddenText = /(TYPESAFE_API_KEY\s*=|authorization:\s*bearer|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)/iu;

const inspect = (value, path) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && forbiddenText.test(value)) fail(`${path} contains secret-shaped text`);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) fail(`${path}.${key} is forbidden in retained evidence`);
    inspect(item, `${path}.${key}`);
  }
};

for (const file of evidenceFiles.filter((name) => name.endsWith(".json"))) {
  const encoded = await readFile(resolve(evidenceDirectory, file), "utf8");
  if (forbiddenText.test(encoded)) fail(`${file} contains secret-shaped text`);
  const evidence = JSON.parse(encoded);
  inspect(evidence, file);
  if (file === "live-jev-milestone.json" && evidence.providerCallCount !== "unknown") {
    fail(`${file} must not infer provider attempts from admission`);
  }
  if (file === "live-jev-issue-52-execution.json" && evidence.totalProviderCallCount !== "unknown") {
    fail(`${file} must preserve unknown provider-attempt count`);
  }
  if (file === "host-codex-0.155.1-linux-arm64.json") {
    if (
      evidence.packageProvenance?.hookEntrypoint !== "installed-package" ||
      evidence.packageProvenance?.checkoutSourceInHookPath !== false ||
      evidence.packageProvenance?.independentObserverImportsCheckoutSource !== false ||
      !/^[a-f0-9]{64}$/.test(evidence.packageProvenance?.artifactSha256 ?? "") ||
      evidence.addLiveEvidence?.activity?.instrumentation !== "resident-v1" ||
      evidence.addLiveEvidence?.activity?.kind !== "submitted" ||
      evidence.addLiveEvidence?.activity?.submission !== "submitted" ||
      evidence.addLiveEvidence?.activity?.modelReaction !== "unavailable"
    ) fail(`${file} must establish installed-package activity provenance`);
    const visibility = evidence.addLiveEvidence?.independentlyObservedModelVisibility;
    if (visibility !== "observed-hook-only-value" &&
        !(visibility === "not-observed" && evidence.verdict === "inconclusive" &&
          evidence.exclusions?.reliableVisibility === true)) {
      fail(`${file} must establish visibility or retain an explicit inconclusive downgrade`);
    }
  }
}

const packageEvidencePath = resolve(root, "evidence/package/clean-linux-node-24.20.0-arm64.json");
const packageEncoded = await readFile(packageEvidencePath, "utf8").catch(() => undefined);
if (packageEncoded === undefined) {
  fail("installed package evidence is missing");
} else {
  if (forbiddenText.test(packageEncoded)) fail("installed package evidence contains secret-shaped text");
  const packageEvidence = JSON.parse(packageEncoded);
  inspect(packageEvidence, "clean-linux-node-24.20.0-arm64.json");
  if (
    packageEvidence.verdict !== "clean-package-and-real-host-passed" ||
    packageEvidence.realCodex?.status !== "passed" ||
    packageEvidence.realCodex?.hostExitCode !== 0 ||
    packageEvidence.realCodex?.hookTrust?.status !== "persisted-exact-definition" ||
    packageEvidence.realCodex?.hookTrust?.flow !== "native-interactive-review" ||
    packageEvidence.realCodex?.hookTrust?.synchronization !== "rendered-screen-state" ||
    packageEvidence.realCodex?.hookTrust?.repositoryTrustSeeded !== false ||
    packageEvidence.realCodex?.hookTrust?.bypassFlag !== false ||
    packageEvidence.realCodex?.reviewSubmission?.status !== "observed" ||
    packageEvidence.realCodex?.reviewSubmission?.controlledBackendSubmissions !== 1 ||
    packageEvidence.realCodex?.reviewCompletion?.status !== "completed-findings" ||
    packageEvidence.realCodex?.reviewCompletion?.terminalOutcomes !== 1 ||
    packageEvidence.realCodex?.reviewCompletion?.correlation !== "resident-native-event-identity" ||
    packageEvidence.realCodex?.independentHook?.status !== "observed" ||
    packageEvidence.realCodex?.independentHook?.observations < 1 ||
    packageEvidence.review?.activity?.submitted?.instrumentation !== "resident-v1" ||
    packageEvidence.review?.activity?.submitted?.kind !== "submitted" ||
    packageEvidence.review?.activity?.submitted?.submission !== "submitted" ||
    packageEvidence.review?.activity?.submitted?.modelReaction !== "unavailable" ||
    packageEvidence.review?.activity?.restart?.before !== "pending" ||
    packageEvidence.review?.activity?.restart?.after !== "restarted/lost" ||
    packageEvidence.review?.activity?.restart?.modelReaction !== "unavailable" ||
    packageEvidence.installation?.preview !== "passed" ||
    packageEvidence.installation?.installed !== "passed" ||
    packageEvidence.installation?.idempotent !== "passed" ||
    packageEvidence.installation?.disableDispatchGate !== "passed" ||
    packageEvidence.installation?.scopedUninstall !== "passed" ||
    packageEvidence.installation?.customQuotedHome !== true ||
    packageEvidence.installation?.independentHookPreserved !== true ||
    packageEvidence.installation?.sourceEgressAuthorized !== false ||
    packageEvidence.isolation?.developmentDependencies !== false ||
    packageEvidence.isolation?.checkoutPathUsedAtRuntime !== false
  ) {
    fail("installed package evidence does not establish the clean real-host seam");
  }
}

const macPackageEvidencePath = resolve(root, "evidence/package/clean-darwin-node-24.20.0-arm64.json");
const macPackageEncoded = await readFile(macPackageEvidencePath, "utf8").catch(() => undefined);
if (macPackageEncoded === undefined) {
  fail("macOS installed package evidence is missing");
} else {
  if (forbiddenText.test(macPackageEncoded)) fail("macOS installed package evidence contains secret-shaped text");
  const macPackageEvidence = JSON.parse(macPackageEncoded);
  inspect(macPackageEvidence, "clean-darwin-node-24.20.0-arm64.json");
  if (
    macPackageEvidence.environment?.node !== "v24.20.0" ||
    macPackageEvidence.environment?.operatingSystem !== "darwin" ||
    macPackageEvidence.environment?.architecture !== "arm64" ||
    macPackageEvidence.continuousIntegration?.provider !== "github-actions" ||
    !/^\d+$/.test(macPackageEvidence.continuousIntegration?.runId ?? "") ||
    !/^[0-9a-f]{40}$/.test(macPackageEvidence.continuousIntegration?.commit ?? "") ||
    macPackageEvidence.isolation?.developmentDependencies !== false ||
    macPackageEvidence.isolation?.checkoutPathUsedAtRuntime !== false ||
    !["cli", "parser", "resident", "hook"].every((entry) => macPackageEvidence.entryPoints?.[entry] === "passed") ||
    macPackageEvidence.installation?.preview !== "passed" ||
    macPackageEvidence.installation?.installed !== "passed" ||
    macPackageEvidence.installation?.idempotent !== "passed" ||
    macPackageEvidence.installation?.scopedUninstall !== "passed" ||
    macPackageEvidence.installation?.disableDispatchGate !== "passed" ||
    macPackageEvidence.installation?.update?.protocolIncompatibility !== "rejected-before-write" ||
    macPackageEvidence.installation?.update?.partialRecovery !== "resumed" ||
    macPackageEvidence.installation?.update?.credentialState !== "preserved-external-native-store" ||
    macPackageEvidence.installation?.update?.controlledReviewAfterUpdate !== "passed" ||
    macPackageEvidence.review?.backend !== "controlled-offline" ||
    macPackageEvidence.review?.submissions !== 2 ||
    macPackageEvidence.review?.adviceReturned !== true ||
    macPackageEvidence.review?.activity?.submitted?.instrumentation !== "resident-v1" ||
    macPackageEvidence.review?.activity?.submitted?.kind !== "submitted" ||
    macPackageEvidence.review?.activity?.restart?.before !== "pending" ||
    macPackageEvidence.review?.activity?.restart?.after !== "restarted/lost" ||
    macPackageEvidence.credentialLifecycle?.status !== "actual-keychain" ||
    macPackageEvidence.credentialLifecycle?.defaultKeychainIsolation !== "lookup-replacement-logout-passed" ||
    macPackageEvidence.credentialLifecycle?.residentRestartPersistence !== "passed-distinct-pid-and-lifetime" ||
    macPackageEvidence.credentialLifecycle?.residentControlledTransportResolution !== "passed" ||
    macPackageEvidence.credentialLifecycle?.logoutBeforeFutureDispatch !== "passed" ||
    macPackageEvidence.credentialLifecycle?.restrictedNativeOutcome !== "timed-out-helper-terminated" ||
    macPackageEvidence.credentialLifecycle?.secretRetainedInEvidence !== false ||
    macPackageEvidence.realCodex?.status !== "not-requested" ||
    macPackageEvidence.verdict !== "clean-package-passed-real-host-not-requested"
  ) {
    fail("macOS installed package evidence does not establish the controlled package path");
  }
}

if (process.exitCode === undefined) {
  process.stdout.write(`direct-event conformance manifest valid: 12 groups, ${obligationCount} obligations, ${checkCount} unique mapped checks, ${evidenceFiles.filter((name) => name.endsWith(".json")).length} sanitized evidence records\n`);
}
