import * as Effect from "effect/Effect";
import { Consent } from "../runtime/consent.ts";
import { loadReviewSettings } from "../runtime/review-config.ts";
import { resolveCredential, saveCredential } from "../credentials/secret-service.ts";
import {
  installCodexIntegration,
  previewCodexInstallation,
  type InstallationRequest,
  type InstallationResult,
} from "./codex-installation.ts";

export type SetupRequest = {
  readonly version: 1;
  readonly operation: "setup";
  readonly host: "codex";
  readonly scope: {
    readonly cwd: string;
    readonly review: "enabled" | "disabled";
  };
  readonly credential: "saved" | "environment" | "skip";
  readonly codexHome?: string;
  readonly codexExecutable?: string;
  readonly installProposalDigest?: string;
  readonly consentProposalDigest?: string;
  readonly interactive?: boolean;
};

type StageStatus = "complete" | "pending" | "skipped" | "unknown" | "unsupported" | "conflict" | "partial";
type SetupStage = {
  readonly stage: "compatibility" | "installation" | "credential" | "repository" | "host-trust" | "execution-context";
  readonly status: StageStatus;
  readonly summary: string;
  readonly observed?: unknown;
};
type SetupAction = {
  readonly stage: SetupStage["stage"];
  readonly code: string;
  readonly action: string;
  readonly authorization?: Readonly<Record<string, string>>;
};

type RecordValue = Readonly<Record<string, unknown>>;
const record = (value: unknown): RecordValue | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
const text = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
const list = (value: unknown): ReadonlyArray<unknown> => Array.isArray(value) ? value : [];

const installationRequest = (request: SetupRequest): InstallationRequest => ({
  ...(request.codexHome === undefined ? {} : { codexHome: request.codexHome }),
  ...(request.codexExecutable === undefined ? {} : { codexExecutable: request.codexExecutable }),
});

export type SetupOptions = {
  readonly statePath: string;
  readonly userConfigPath?: string;
  /** Supplied only by the installed CLI's masked /dev/tty handoff. */
  readonly readCredential?: () => Promise<string>;
};

export const runSetup = Effect.fn("Setup.run")(function* (
  request: SetupRequest,
  options: SetupOptions,
) {
  const stages: Array<SetupStage> = [];
  const actions: Array<SetupAction> = [];
  const completed: Array<string> = [];
  const pending: Array<string> = [];
  const installRequest = installationRequest(request);
  let installation = previewCodexInstallation(installRequest) as InstallationResult;
  let installationRecord = record(installation) ?? {};
  const previewHost = record(installationRecord.host);
  const compatibility = record(previewHost?.compatibility);
  const installationStatus = text(installationRecord.status) ?? "conflict";
  const hostHome = text(previewHost?.home) ?? request.codexHome;

  if (installationStatus === "unsupported") {
    stages.push({ stage: "compatibility", status: "unsupported", summary: "the selected Codex host is unsupported", observed: compatibility });
    actions.push({
      stage: "compatibility",
      code: "select-supported-host",
      action: "select a Codex 0.155.1 executable and the exact declared Node runtime, then rerun setup",
    });
  } else {
    stages.push({ stage: "compatibility", status: "complete", summary: "the selected Codex host and packaged runtime are compatible", observed: compatibility });
    completed.push("compatibility checked");
  }

  const proposal = record(installationRecord.proposal);
  const installDigest = text(proposal?.digest);
  const installedAtPreview = installationRecord.installed === true;
  if (installationStatus === "partial" && request.installProposalDigest === installDigest && installDigest !== undefined) {
    installation = yield* Effect.promise(() => installCodexIntegration({ ...installRequest, proposalDigest: installDigest }));
    installationRecord = record(installation) ?? {};
  } else if (installationStatus === "preview" && !installedAtPreview && request.installProposalDigest === installDigest && installDigest !== undefined) {
    installation = yield* Effect.promise(() => installCodexIntegration({ ...installRequest, proposalDigest: installDigest }));
    installationRecord = record(installation) ?? {};
  }

  const currentInstallationStatus = text(installationRecord.status) ?? installationStatus;
  const installed = installedAtPreview || currentInstallationStatus === "installed" || currentInstallationStatus === "already-installed";
  if (installed) {
    stages.push({
      stage: "installation",
      status: "complete",
      summary: currentInstallationStatus === "already-installed" || installedAtPreview
        ? "the owned Codex integration is already installed"
        : "the owned Codex integration was installed",
      observed: { home: hostHome, changes: list(installationRecord.completed) },
    });
    completed.push("owned Codex integration installed");
  } else if (currentInstallationStatus === "partial") {
    stages.push({ stage: "installation", status: "partial", summary: "installation stopped after partial completion", observed: installationRecord.recovery });
    const recovery = record(installationRecord.recovery);
    const recoveryDigest = text(recovery?.proposalDigest) ?? installDigest;
    actions.push({
      stage: "installation",
      code: "resume-installation",
      action: "rerun setup with the journaled installation proposal digest",
      ...(recoveryDigest === undefined ? {} : { authorization: { installProposalDigest: recoveryDigest } }),
    });
    pending.push("resume the journaled installation");
  } else if (currentInstallationStatus === "preview" && installDigest !== undefined) {
    stages.push({
      stage: "installation",
      status: "pending",
      summary: "installation requires approval of the exact owned changes",
      observed: { changes: list(proposal?.changes).map((change) => record(change)?.description).filter((value) => typeof value === "string") },
    });
    actions.push({
      stage: "installation",
      code: "approve-installation",
      action: "review the change summary, then rerun setup with its proposal digest",
      authorization: { installProposalDigest: installDigest },
    });
    pending.push("approve the owned Codex configuration changes");
  } else {
    const status: StageStatus = currentInstallationStatus === "unsupported" ? "unsupported" : "conflict";
    stages.push({ stage: "installation", status, summary: "the owned Codex integration could not be installed", observed: installationRecord.error });
    actions.push({
      stage: "installation",
      code: status === "unsupported" ? "select-supported-host" : "resolve-installation-conflict",
      action: status === "unsupported"
        ? "select a supported Codex executable and host configuration home, then rerun setup"
        : "preserve the selected host files, resolve the reported ownership or configuration conflict, then rerun setup",
    });
    pending.push("resolve the reported installation problem");
  }

  const consent = yield* Consent.Service;
  const rootResult = yield* consent.discoverRoot(request.scope.cwd).pipe(Effect.result);
  const settingsResult = rootResult._tag === "Success"
    ? yield* loadReviewSettings(
        rootResult.success,
        options.userConfigPath === undefined ? {} : { userConfigPath: options.userConfigPath },
      ).pipe(Effect.result)
    : undefined;

  if (rootResult._tag === "Failure" || settingsResult === undefined || settingsResult._tag === "Failure") {
    stages.push({
      stage: "credential",
      status: "unknown",
      summary: "credential selection is unknown because repository configuration is unavailable",
    });
    stages.push({
      stage: "repository",
      status: rootResult._tag === "Failure" ? "unsupported" : "conflict",
      summary: rootResult._tag === "Failure"
        ? "the requested scope is not a discoverable Git working tree"
        : "the repository review configuration is invalid",
    });
    actions.push({
      stage: "repository",
      code: rootResult._tag === "Failure" ? "select-repository" : "repair-repository-configuration",
      action: rootResult._tag === "Failure"
        ? "select a discoverable canonical Git working tree, then rerun setup"
        : "repair the reported repository review configuration, then rerun setup",
    });
    pending.push("repair repository discovery or configuration");
  } else {
    const settings = settingsResult.success;
    const environmentOnly = request.credential === "environment" ||
      settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in";
    if (request.credential === "skip") {
      stages.push({
        stage: "credential",
        status: request.scope.review === "disabled" ? "skipped" : "pending",
        summary: "credential setup was explicitly skipped",
      });
      if (request.scope.review === "disabled") completed.push("credential setup skipped");
      else {
        actions.push({
          stage: "credential",
          code: "select-credential-source",
          action: "rerun setup with an explicit saved or environment credential source before expecting review readiness",
        });
        pending.push("select a credential source");
      }
    } else {
      let resolution = yield* Effect.promise(() => resolveCredential({
        envVar: settings.credentialEnvVar,
        environmentOnly,
      }));
      if (
        request.credential === "saved" &&
        request.interactive === true &&
        resolution.source === "saved" &&
        resolution.status === "missing" &&
        options.readCredential !== undefined &&
        installed
      ) {
        const valueResult = yield* Effect.tryPromise(options.readCredential).pipe(Effect.result);
        if (valueResult._tag === "Success") {
          let value = valueResult.success;
          const saved = yield* Effect.promise(() => saveCredential(value));
          value = "";
          if (saved.status === "stored") {
            resolution = yield* Effect.promise(() => resolveCredential({
              envVar: settings.credentialEnvVar,
              environmentOnly: false,
            }));
          }
        }
      }
      if (resolution.status === "present") {
        stages.push({
          stage: "credential",
          status: "complete",
          summary: `a review credential is available from ${resolution.source}`,
          observed: { source: resolution.source, inspectedContext: "setup-process", valueDisclosed: false },
        });
        completed.push("credential available to setup");
      } else {
        const code = resolution.status === "locked" ? "unlock-credential-store" : "provide-credential";
        stages.push({
          stage: "credential",
          status: "pending",
          summary: `the selected ${resolution.source} credential is ${resolution.status}`,
          observed: { source: resolution.source, status: resolution.status, inspectedContext: "setup-process", valueDisclosed: false },
        });
        actions.push({
          stage: "credential",
          code,
          action: resolution.status === "locked"
            ? "unlock the login keyring in the desktop session, then rerun setup interactively"
            : request.credential === "environment" || environmentOnly
              ? `set ${settings.credentialEnvVar} in the selected host execution environment, then rerun setup`
              : "rerun setup interactively in a user terminal for masked credential entry",
        });
        pending.push("make the selected credential available");
      }
    }

    const authorization = yield* consent.authorize(
      request.scope.cwd,
      settings.backend,
      settings.destination,
    );
    if (request.scope.review === "disabled") {
      if (authorization.status === "approved" && installed) {
        yield* consent.disable(request.scope.cwd, settings.backend, settings.destination);
      }
      stages.push({
        stage: "repository",
        status: "complete",
        summary: "repository review is disabled as requested",
        observed: { canonicalRoot: rootResult.success, backend: settings.backend, destination: settings.destination, scope: "repository-wide eligible source files" },
      });
      completed.push("repository review disabled");
    } else if (authorization.status === "approved") {
      stages.push({
        stage: "repository",
        status: "complete",
        summary: "existing repository consent remains valid",
        observed: { canonicalRoot: authorization.identity.root, backend: authorization.identity.backend, destination: authorization.identity.destination, scope: "repository-wide eligible source files" },
      });
      completed.push("repository consent reused");
    } else {
      const consentProposal = yield* consent.preview(request.scope.cwd, settings.backend, settings.destination);
      if (installed && request.consentProposalDigest === consentProposal.digest) {
        const identity = yield* consent.enable(consentProposal);
        stages.push({
          stage: "repository",
          status: "complete",
          summary: "repository review was enabled with matching-digest consent",
          observed: { canonicalRoot: identity.root, backend: identity.backend, destination: identity.destination, scope: consentProposal.scope },
        });
        completed.push("repository review enabled");
      } else {
        stages.push({
          stage: "repository",
          status: "pending",
          summary: "repository review requires explicit consent",
          observed: { canonicalRoot: consentProposal.target.root, backend: consentProposal.target.backend, destination: consentProposal.target.destination, scope: consentProposal.scope },
        });
        actions.push({
          stage: "repository",
          code: "approve-repository-consent",
          action: "review the canonical repository, destination, and eligible-source scope, then rerun setup with its consent proposal digest",
          authorization: { consentProposalDigest: consentProposal.digest },
        });
        pending.push("approve repository source-egress consent");
      }
    }
  }

  if (installed) {
    stages.push({
      stage: "host-trust",
      status: "unknown",
      summary: "Codex native repository and hook trust cannot be queried offline",
      observed: { trustRecordsModified: false, bypassUsed: false },
    });
    actions.push({
      stage: "host-trust",
      code: "complete-native-trust",
      action: "start Codex normally in the canonical repository and complete any native repository or hook review prompt",
    });
  } else {
    stages.push({ stage: "host-trust", status: "pending", summary: "native trust follows installation" });
  }
  stages.push({
    stage: "execution-context",
    status: "unknown",
    summary: "actual host invocation and credential accessibility remain unknown until observed",
    observed: { providerCalls: 0, reviewPerformed: false },
  });

  const blockingStage = stages.find((stage) => stage.status === "unsupported" || stage.status === "conflict" || stage.status === "partial");
  const status = blockingStage?.status === "unsupported"
    ? "unsupported"
    : blockingStage?.status === "conflict"
      ? "conflict"
      : blockingStage?.status === "partial"
        ? "partial"
        : request.scope.review === "disabled" && installed
          ? "completed"
          : actions.length > 0
            ? "needs-user-action"
            : "completed";
  return {
    version: 1 as const,
    operation: "setup" as const,
    status,
    host: { adapter: request.host, ...(hostHome === undefined ? {} : { home: hostHome }) },
    scope: {
      repository: rootResult._tag === "Success" ? rootResult.success : request.scope.cwd,
      review: request.scope.review,
    },
    providerCalls: 0 as const,
    paidVerificationPerformed: false as const,
    stages,
    completed,
    pending,
    actions: actions.slice(0, 4),
  };
});

export * as Setup from "./setup.ts";
