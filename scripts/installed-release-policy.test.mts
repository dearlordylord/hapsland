import { describe, expect, it } from "vitest";
import {
  inspectRetainedEvidence,
  releaseReadiness,
  validateInstalledReleaseManifest,
  verifyOfflineReplay,
} from "./installed-release-policy.mjs";
import type { InstalledReleaseManifest } from "./installed-release-policy.mjs";

const manifest: InstalledReleaseManifest = {
  schemaVersion: 1,
  subject: { assembledCommit: "f2f47e94cd2d90cf73062f07c5e61416218e2f13", publication: "not-selected" },
  targetProfiles: ["linux", "darwin"].map((operatingSystem) => ({
    operatingSystem, architecture: "arm64", node: "v24.20.0", codex: "codex-cli 0.155.1",
  })),
  ordinaryReplay: { node: "v24.20.0", setupJourneys: ["headless", "interactive"] },
  evidence: ["linux", "darwin"].map((operatingSystem) => ({
    id: `${operatingSystem}-record`, path: `evidence/${operatingSystem}-record.json`, sha256: "a".repeat(64),
    operatingSystem,
    provenance: { commit: "b".repeat(40) }, assertions: [
      { pointer: "/environment/operatingSystem", equals: operatingSystem },
      { pointer: "/status", equals: "passed" },
    ],
    capabilityProofs: [
      {
        capability: "installed-lifecycle", operatingSystem,
        assertions: [{ pointer: "/status", equals: "passed" }],
      },
      {
        capability: "native-trust", operatingSystem,
        assertions: [{ pointer: "/status", equals: "passed" }],
      },
      ...(operatingSystem === "linux" ? [{
        capability: "authenticated-real-host", operatingSystem,
        assertions: [
          { pointer: "/realCodex/status", equals: "passed" },
          { pointer: "/realCodex/hookTrust/bypassFlag", equals: false },
          { pointer: "/realCodex/reviewSubmission/status", equals: "observed" },
        ],
      }] : []),
    ],
  })),
  compatibilityCells: [
    ...["linux", "darwin"].flatMap((operatingSystem) =>
      ["installed-lifecycle", "native-trust", "authenticated-real-host"].map((capability) => ({
        id: `${operatingSystem}-${capability}`, operatingSystem, capability, required: true,
        status: operatingSystem === "darwin" && capability === "authenticated-real-host" ? "gap" : "verified",
        ...(operatingSystem === "darwin" && capability === "authenticated-real-host"
          ? { reason: "authentication absent" } : { evidence: [`${operatingSystem}-record`] }),
      }))),
    { id: "first-review", capability: "installed-first-review", required: true, status: "inconclusive", reason: "zero calls" },
  ],
  limitations: { overlappingWrites: "unsupported-unattributed" },
};

describe("installed release policy", () => {
  it("keeps every missing required cell machine-visible", () => {
    const result = releaseReadiness(manifest);
    expect(result).toMatchObject({
      status: "blocked",
      blockingCells: [
        { id: "darwin-authenticated-real-host", status: "gap", reason: "authentication absent" },
        { id: "first-review", status: "inconclusive", reason: "zero calls" },
      ],
    });
  });

  it("rejects a silently removed platform capability", () => {
    const compatibilityCells = manifest.compatibilityCells.filter((cell) => cell.id !== "darwin-native-trust");
    expect(() => validateInstalledReleaseManifest({ ...manifest, compatibilityCells }))
      .toThrow("darwin native-trust cell cannot be omitted");
  });

  it("rejects cross-platform evidence reuse for an authenticated-host cell", () => {
    const compatibilityCells = manifest.compatibilityCells.map((cell) =>
      cell.id === "darwin-authenticated-real-host"
        ? { ...cell, status: "verified" as const, evidence: ["linux-record"], reason: undefined }
        : cell);
    expect(() => validateInstalledReleaseManifest({ ...manifest, compatibilityCells }))
      .toThrow("cites linux evidence for darwin");
  });

  it("rejects flipping first-review to verified with unrelated Linux evidence", () => {
    const compatibilityCells = manifest.compatibilityCells.map((cell) =>
      cell.id === "first-review"
        ? { ...cell, status: "verified" as const, operatingSystem: "linux", evidence: ["linux-record"], reason: undefined }
        : cell);
    expect(() => validateInstalledReleaseManifest({ ...manifest, compatibilityCells }))
      .toThrow("without a matching capability proof");
  });

  it("rejects a first-review proof that lacks provider and source observations", () => {
    const evidence = manifest.evidence.map((item) => item.id === "linux-record" ? {
      ...item,
      capabilityProofs: [...item.capabilityProofs, {
        capability: "installed-first-review",
        operatingSystem: "linux",
        assertions: [{ pointer: "/status", equals: "passed" }],
      }],
    } : item);
    const compatibilityCells = manifest.compatibilityCells.map((cell) =>
      cell.id === "first-review"
        ? { ...cell, status: "verified" as const, operatingSystem: "linux", evidence: ["linux-record"], reason: undefined }
        : cell);
    expect(() => validateInstalledReleaseManifest({ ...manifest, evidence, compatibilityCells }))
      .toThrow("lacks conclusive first-review semantic proof");
  });

  it("checks both checksum identity and semantic evidence", () => {
    const payload = {
      status: "passed",
      realCodex: { status: "passed", hookTrust: { bypassFlag: false }, reviewSubmission: { status: "observed" } },
    };
    const artifacts = new Map([
      ["linux-record", { sha256: "a".repeat(64), payload: { ...payload, environment: { operatingSystem: "linux" } } }],
      ["darwin-record", { sha256: "a".repeat(64), payload: { ...payload, environment: { operatingSystem: "darwin" } } }],
    ]);
    expect(inspectRetainedEvidence(manifest, artifacts)).toHaveLength(2);
    expect(() => inspectRetainedEvidence(manifest,
      new Map([
        ["linux-record", { sha256: "c".repeat(64), payload: { ...payload, environment: { operatingSystem: "linux" } } }],
        ["darwin-record", { sha256: "a".repeat(64), payload: { ...payload, environment: { operatingSystem: "darwin" } } }],
      ])))
      .toThrow("checksum mismatch");
  });

  it("accepts only a full offline installed lifecycle replay", () => {
    const replay = {
      environment: { operatingSystem: "linux", architecture: "arm64" },
      setup: { version: 1, operation: "setup-package-conformance", status: "passed", providerCalls: 0, journeys: ["headless", "interactive"] },
      package: {
        environment: { node: "v24.20.0", operatingSystem: "linux", architecture: "arm64" },
        installation: {
          preview: "passed", installed: "passed", idempotent: "passed", scopedUninstall: "passed",
          customQuotedHome: true, independentHookPreserved: true, disableDispatchGate: "passed",
          update: { protocolIncompatibility: "rejected-before-write", partialRecovery: "resumed", previousHookRetainedOnPartialFailure: true, controlledReviewAfterUpdate: "passed" },
        },
        credentialLifecycle: { status: "controlled-helper", residentRestartPersistence: "passed", logoutBeforeFutureDispatch: "passed" },
        review: { backend: "controlled-offline", adviceReturned: true },
        realCodex: { status: "not-requested" },
      },
      credentialFixtures: "passed",
    };
    expect(verifyOfflineReplay(manifest, replay)).toEqual({ status: "passed", providerCalls: 0, authenticatedHostRuns: 0, paidRuns: 0 });
    replay.package.installation.update.partialRecovery = "failed";
    expect(() => verifyOfflineReplay(manifest, replay)).toThrow("update failure/recovery");
  });
});
