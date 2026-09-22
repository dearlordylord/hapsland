export interface InstalledReleaseManifest {
  readonly schemaVersion: 1;
  readonly subject: { readonly assembledCommit: string; readonly publication: "not-selected" };
  readonly targetProfiles: ReadonlyArray<{ readonly operatingSystem: string; readonly architecture: string; readonly node: string; readonly codex: string }>;
  readonly evidence: ReadonlyArray<{
    readonly id: string;
    readonly path: string;
    readonly sha256: string;
    readonly operatingSystem: string;
    readonly provenance: { readonly commit: string };
    readonly assertions: ReadonlyArray<{ readonly pointer: string; readonly equals?: unknown; readonly greaterThan?: number }>;
    readonly capabilityProofs: ReadonlyArray<{
      readonly capability: string;
      readonly operatingSystem: string;
      readonly assertions: ReadonlyArray<{ readonly pointer: string; readonly equals?: unknown; readonly greaterThan?: number }>;
    }>;
  }>;
  readonly compatibilityCells: ReadonlyArray<{
    readonly id: string;
    readonly operatingSystem?: string;
    readonly capability: string;
    readonly required: boolean;
    readonly status: "verified" | "gap" | "inconclusive";
    readonly evidence?: ReadonlyArray<string>;
    readonly reason?: string;
  }>;
  readonly ordinaryReplay: { readonly node: string; readonly setupJourneys: ReadonlyArray<string> };
  readonly limitations: { readonly overlappingWrites: "unsupported-unattributed" };
}

export declare const validateInstalledReleaseManifest: (manifest: unknown) => InstalledReleaseManifest;
export declare const inspectRetainedEvidence: (
  manifest: InstalledReleaseManifest,
  artifacts: ReadonlyMap<string, { readonly sha256: string; readonly payload: unknown }>,
) => ReadonlyArray<{ readonly id: string; readonly path: string; readonly sha256: string; readonly status: "verified" }>;
export declare const releaseReadiness: (manifest: InstalledReleaseManifest) => {
  readonly status: "release-ready" | "blocked";
  readonly blockingCells: ReadonlyArray<{ readonly id: string; readonly status: string; readonly reason?: string }>;
  readonly verifiedCells: ReadonlyArray<string>;
};
export declare const verifyOfflineReplay: (manifest: InstalledReleaseManifest, replay: unknown) => {
  readonly status: "passed";
  readonly providerCalls: 0;
  readonly authenticatedHostRuns: 0;
  readonly paidRuns: 0;
};
