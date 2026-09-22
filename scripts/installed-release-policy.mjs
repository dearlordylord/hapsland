const hex = (length) => new RegExp(`^[0-9a-f]{${length}}$`);

const requireValue = (condition, message) => {
  if (!condition) throw new Error(message);
};

const pointerValue = (value, pointer) => {
  requireValue(typeof pointer === "string" && pointer.startsWith("/"), `invalid JSON pointer ${String(pointer)}`);
  return pointer.slice(1).split("/").reduce((current, component) => {
    const key = component.replaceAll("~1", "/").replaceAll("~0", "~");
    requireValue(current !== null && typeof current === "object" && Object.hasOwn(current, key),
      `evidence is missing ${pointer}`);
    return current[key];
  }, value);
};

const assertionMatches = (assertion, observed) =>
  Object.hasOwn(assertion, "equals")
    ? JSON.stringify(observed) === JSON.stringify(assertion.equals)
    : typeof assertion.greaterThan === "number" && typeof observed === "number" && observed > assertion.greaterThan;

const hasAssertion = (assertions, pointer, predicate) =>
  assertions.some((assertion) => assertion.pointer === pointer && predicate(assertion));

const validateAssertion = (assertion, label) => {
  requireValue(assertion !== null && typeof assertion === "object" && typeof assertion.pointer === "string" && assertion.pointer.startsWith("/"),
    `${label} has an invalid JSON assertion`);
  const operators = Number(Object.hasOwn(assertion, "equals")) + Number(Object.hasOwn(assertion, "greaterThan"));
  requireValue(operators === 1 && (!Object.hasOwn(assertion, "greaterThan") || typeof assertion.greaterThan === "number"),
    `${label} must declare exactly one supported assertion operator`);
};

const requireCapabilitySemantics = (cell, proof) => {
  if (cell.capability === "authenticated-real-host") {
    requireValue(hasAssertion(proof.assertions, "/realCodex/status", (assertion) => assertion.equals === "passed") &&
      hasAssertion(proof.assertions, "/realCodex/hookTrust/bypassFlag", (assertion) => assertion.equals === false) &&
      hasAssertion(proof.assertions, "/realCodex/reviewSubmission/status", (assertion) => assertion.equals === "observed"),
    `${cell.id} lacks authenticated-host semantic proof`);
  }
  if (cell.capability === "installed-first-review") {
    requireValue(hasAssertion(proof.assertions, "/status", (assertion) => assertion.equals === "passed") &&
      hasAssertion(proof.assertions, "/stages/completion", (assertion) => assertion.equals === "completed") &&
      hasAssertion(proof.assertions, "/stages/submission", (assertion) => assertion.equals === "submitted") &&
      hasAssertion(proof.assertions, "/stages/findings", (assertion) => assertion.greaterThan === 0) &&
      hasAssertion(proof.assertions, "/stages/modelReaction", (assertion) => assertion.equals === "observed") &&
      hasAssertion(proof.assertions, "/stages/modelReactionSource", (assertion) => assertion.equals === "correlated-finding-reaction") &&
      hasAssertion(proof.assertions, "/stages/deliveredFindingCorrelation", (assertion) => assertion.equals === true) &&
      hasAssertion(proof.assertions, "/stages/repair", (assertion) => assertion.equals === "independently-validated") &&
      hasAssertion(proof.assertions, "/stages/followUpReview", (assertion) => assertion.equals === "completed") &&
      hasAssertion(proof.assertions, "/stages/providerCalls", (assertion) => assertion.greaterThan === 0) &&
      hasAssertion(proof.assertions, "/stages/sourceBytes", (assertion) => assertion.greaterThan === 0),
    `${cell.id} lacks conclusive first-review semantic proof`);
  }
};

export const validateInstalledReleaseManifest = (manifest) => {
  requireValue(manifest?.schemaVersion === 1, "installed-release manifest schemaVersion must be 1");
  requireValue(manifest?.subject?.assembledCommit === "f2f47e94cd2d90cf73062f07c5e61416218e2f13",
    "installed-release manifest must name the assembled issue 63-71 commit");
  requireValue(manifest?.subject?.publication === "not-selected", "public naming or registry publication is outside this release gate");
  requireValue(Array.isArray(manifest?.targetProfiles) && manifest.targetProfiles.length === 2,
    "exactly the declared Linux and macOS profiles are required");
  for (const operatingSystem of ["linux", "darwin"]) {
    const profile = manifest.targetProfiles.find((candidate) => candidate.operatingSystem === operatingSystem);
    requireValue(profile?.architecture === "arm64", `${operatingSystem} target must declare arm64`);
    requireValue(profile?.node === "v24.20.0", `${operatingSystem} target must declare Node v24.20.0`);
    requireValue(profile?.codex === "codex-cli 0.155.1", `${operatingSystem} target must declare Codex 0.155.1`);
  }
  requireValue(Array.isArray(manifest?.evidence) && manifest.evidence.length > 0, "retained evidence is required");
  const evidenceIds = new Set();
  for (const evidence of manifest.evidence) {
    requireValue(typeof evidence.id === "string" && !evidenceIds.has(evidence.id), "evidence IDs must be unique");
    evidenceIds.add(evidence.id);
    requireValue(typeof evidence.path === "string" && evidence.path.startsWith("evidence/") && !evidence.path.includes(".."),
      `${evidence.id} has an unsafe evidence path`);
    requireValue(hex(64).test(evidence.sha256), `${evidence.id} must declare an exact SHA-256`);
    requireValue(hex(40).test(evidence.provenance?.commit), `${evidence.id} must declare an exact provenance commit`);
    requireValue(["linux", "darwin"].includes(evidence.operatingSystem),
      `${evidence.id} must bind evidence to a target operating system`);
    requireValue(Array.isArray(evidence.assertions) && evidence.assertions.length > 0,
      `${evidence.id} must declare semantic assertions`);
    for (const assertion of evidence.assertions) validateAssertion(assertion, evidence.id);
    requireValue(hasAssertion(evidence.assertions, "/environment/operatingSystem",
      (assertion) => assertion.equals === evidence.operatingSystem),
    `${evidence.id} must prove its declared operating system`);
    requireValue(Array.isArray(evidence.capabilityProofs), `${evidence.id} must declare capability proofs`);
    for (const proof of evidence.capabilityProofs) {
      requireValue(typeof proof.capability === "string" && proof.operatingSystem === evidence.operatingSystem,
        `${evidence.id} has an unbound capability proof`);
      requireValue(Array.isArray(proof.assertions) && proof.assertions.length > 0,
        `${evidence.id} capability ${proof.capability} needs semantic assertions`);
      for (const assertion of proof.assertions) validateAssertion(assertion, `${evidence.id} ${proof.capability}`);
    }
  }
  requireValue(Array.isArray(manifest?.compatibilityCells) && manifest.compatibilityCells.length > 0,
    "compatibility cells are required");
  const cellIds = new Set();
  for (const cell of manifest.compatibilityCells) {
    requireValue(typeof cell.id === "string" && !cellIds.has(cell.id), "compatibility cell IDs must be unique");
    cellIds.add(cell.id);
    requireValue(["verified", "gap", "inconclusive"].includes(cell.status), `${cell.id} has an invalid status`);
    if (cell.status === "verified") {
      requireValue(Array.isArray(cell.evidence) && cell.evidence.length > 0 && cell.evidence.every((id) => evidenceIds.has(id)),
        `${cell.id} needs retained evidence`);
      requireValue(["linux", "darwin"].includes(cell.operatingSystem), `${cell.id} must bind verified compatibility to a platform`);
      const citedEvidence = manifest.evidence.filter((evidence) => cell.evidence.includes(evidence.id));
      const matchingProofs = citedEvidence.flatMap((evidence) => {
        requireValue(evidence.operatingSystem === cell.operatingSystem,
          `${cell.id} cites ${evidence.operatingSystem} evidence for ${cell.operatingSystem}`);
        const proofs = evidence.capabilityProofs.filter((proof) =>
          proof.capability === cell.capability && proof.operatingSystem === cell.operatingSystem);
        requireValue(proofs.length > 0,
          `${cell.id} cites ${evidence.id} without a matching capability proof`);
        return proofs;
      });
      requireValue(matchingProofs.length > 0,
        `${cell.id} has no ${cell.operatingSystem} ${cell.capability} capability proof`);
      for (const proof of matchingProofs) requireCapabilitySemantics(cell, proof);
    } else {
      requireValue(typeof cell.reason === "string" && cell.reason.length > 0, `${cell.id} needs an explicit gap reason`);
      if (cell.evidence !== undefined) {
        requireValue(Array.isArray(cell.evidence) && cell.evidence.length > 0 &&
          cell.evidence.every((id) => evidenceIds.has(id)), `${cell.id} cites unknown gap evidence`);
        if (cell.operatingSystem !== undefined) {
          requireValue(manifest.evidence.filter((evidence) => cell.evidence.includes(evidence.id))
            .every((evidence) => evidence.operatingSystem === cell.operatingSystem),
          `${cell.id} cites evidence from another platform`);
        }
      }
    }
  }
  for (const operatingSystem of ["linux", "darwin"]) {
    for (const capability of ["installed-lifecycle", "native-trust", "authenticated-real-host"]) {
      requireValue(manifest.compatibilityCells.some((cell) =>
        cell.operatingSystem === operatingSystem && cell.capability === capability && cell.required === true),
      `${operatingSystem} ${capability} cell cannot be omitted`);
    }
  }
  requireValue(manifest.compatibilityCells.some((cell) =>
    cell.capability === "installed-first-review" && cell.required === true),
  "installed first-review cell cannot be omitted");
  requireValue(manifest.limitations?.overlappingWrites === "unsupported-unattributed",
    "the overlapping-write attribution limitation must remain explicit");
  return manifest;
};

export const inspectRetainedEvidence = (manifest, artifacts) => {
  validateInstalledReleaseManifest(manifest);
  const results = manifest.evidence.map((declaration) => {
    const artifact = artifacts.get(declaration.id);
    requireValue(artifact !== undefined, `${declaration.id} was not loaded`);
    requireValue(artifact.sha256 === declaration.sha256,
      `${declaration.id} checksum mismatch: expected ${declaration.sha256}, observed ${artifact.sha256}`);
    for (const assertion of declaration.assertions) {
      const observed = pointerValue(artifact.payload, assertion.pointer);
      requireValue(assertionMatches(assertion, observed),
        `${declaration.id}${assertion.pointer} did not satisfy its evidence assertion; observed ${JSON.stringify(observed)}`);
    }
    for (const proof of declaration.capabilityProofs) {
      for (const assertion of proof.assertions) {
        const observed = pointerValue(artifact.payload, assertion.pointer);
        requireValue(assertionMatches(assertion, observed),
          `${declaration.id} ${proof.capability}${assertion.pointer} did not satisfy its capability proof; observed ${JSON.stringify(observed)}`);
      }
    }
    return { id: declaration.id, path: declaration.path, sha256: artifact.sha256, status: "verified" };
  });
  return results;
};

export const releaseReadiness = (manifest) => {
  validateInstalledReleaseManifest(manifest);
  const blockingCells = manifest.compatibilityCells
    .filter((cell) => cell.required && cell.status !== "verified")
    .map(({ id, status, reason }) => ({ id, status, reason }));
  return {
    status: blockingCells.length === 0 ? "release-ready" : "blocked",
    blockingCells,
    verifiedCells: manifest.compatibilityCells.filter((cell) => cell.status === "verified").map((cell) => cell.id),
  };
};

export const verifyOfflineReplay = (manifest, replay) => {
  const expected = manifest.ordinaryReplay;
  requireValue(replay.setup?.version === 1 && replay.setup?.operation === "setup-package-conformance" &&
    replay.setup?.status === "passed" && replay.setup?.providerCalls === 0,
  "offline replay did not pass bounded headless/interactive setup");
  requireValue(expected.setupJourneys.every((journey) => replay.setup.journeys?.includes(journey)),
    "offline replay omitted a required setup journey");
  requireValue(replay.package?.environment?.node === expected.node &&
    replay.package?.environment?.operatingSystem === replay.environment.operatingSystem &&
    replay.package?.environment?.architecture === replay.environment.architecture,
  "offline replay used an undeclared Node/platform profile");
  requireValue(replay.package?.installation?.preview === "passed" &&
    replay.package?.installation?.installed === "passed" &&
    replay.package?.installation?.idempotent === "passed" &&
    replay.package?.installation?.scopedUninstall === "passed" &&
    replay.package?.installation?.customQuotedHome === true &&
    replay.package?.installation?.independentHookPreserved === true &&
    replay.package?.installation?.disableDispatchGate === "passed",
  "offline replay did not complete the installed lifecycle and preservation checks");
  requireValue(replay.package?.installation?.update?.protocolIncompatibility === "rejected-before-write" &&
    replay.package?.installation?.update?.partialRecovery === "resumed" &&
    replay.package?.installation?.update?.previousHookRetainedOnPartialFailure === true &&
    replay.package?.installation?.update?.controlledReviewAfterUpdate === "passed",
  "offline replay did not complete update failure/recovery checks");
  const expectedCredentialStatus = replay.environment.operatingSystem === "darwin" ? "actual-keychain" : "controlled-helper";
  requireValue(replay.package?.credentialLifecycle?.status === expectedCredentialStatus &&
    replay.package?.credentialLifecycle?.residentRestartPersistence?.startsWith("passed") &&
    replay.package?.credentialLifecycle?.logoutBeforeFutureDispatch === "passed",
  "offline replay did not complete the saved-credential lifecycle checks");
  requireValue(replay.package?.review?.backend === "controlled-offline" &&
    replay.package?.review?.adviceReturned === true && replay.package?.realCodex?.status === "not-requested",
  "offline replay was not the controlled no-authentication review seam");
  requireValue(replay.credentialFixtures === "passed", "environment-key server fixtures did not pass");
  return { status: "passed", providerCalls: 0, authenticatedHostRuns: 0, paidRuns: 0 };
};
