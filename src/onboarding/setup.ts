import * as Effect from "effect/Effect";
import { discoverWorkingTreeRoot } from "../repository/root.ts";
import { loadReviewSettings } from "../runtime/review-config.ts";
import { resolveCredential, saveCredential } from "../credentials/secret-service.ts";
import {
  installCodexIntegration,
  previewCodexInstallation,
  type InstallationRequest,
} from "./codex-installation.ts";
import { installClaudeIntegration, hasClaudeRegistration, previewClaudeInstallation, previewClaudeUpdate, updateClaudeIntegration } from "./claude-installation.ts";

type SetupFields = {
  readonly version: 1;
  readonly operation: "setup";
  readonly scope: {
    readonly cwd: string;
    readonly review: "enabled" | "disabled";
  };
  readonly credential: "saved" | "environment" | "skip";
  readonly installProposalDigest?: string;
  readonly interactive?: boolean;
};

export type SetupRequest = SetupFields & (
  | { readonly host: "codex"; readonly codexHome?: string; readonly codexExecutable?: string }
  | { readonly host: "claude"; readonly claudeHome?: string; readonly claudeExecutable?: string }
);

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

const installationRequest = (request: Extract<SetupRequest, { host: "codex" }>): InstallationRequest => ({
  ...(request.codexHome === undefined ? {} : { codexHome: request.codexHome }),
  ...(request.codexExecutable === undefined ? {} : { codexExecutable: request.codexExecutable }),
});

export type SetupOptions = {
  readonly statePath: string;
  readonly userConfigPath?: string;
  /** Supplied only by the installed CLI's masked /dev/tty handoff. */
  readonly readCredential?: () => Effect.Effect<string, unknown>;
};

export const runSetup = Effect.fn("Setup.run")(function* (
  request: SetupRequest,
  options: SetupOptions,
) {
  const stages: Array<SetupStage> = [];
  const actions: Array<SetupAction> = [];
  const completed: Array<string> = [];
  const pending: Array<string> = [];
  const hostName = request.host === "claude" ? "Claude Code" : "Codex";
  const claudeRequest = request.host === "claude" ? {
    ...(request.claudeHome === undefined ? {} : { claudeHome: request.claudeHome }),
    ...(request.claudeExecutable === undefined ? {} : { claudeExecutable: request.claudeExecutable }),
  } : {};
  const codexRequest = request.host === "codex" ? installationRequest(request) : {};
  const claudeInstalled = request.host === "claude" && hasClaudeRegistration(claudeRequest);
  const preview = () => {
    if (request.host !== "claude") return previewCodexInstallation(codexRequest);
    if (!claudeInstalled) return previewClaudeInstallation(claudeRequest);
    const target = previewClaudeUpdate(claudeRequest);
    const changes = list(record(record(target)?.proposal)?.changes);
    return { ...target, installed: target.status === "preview" && changes.length === 0 };
  };
  const install = (proposalDigest: string) => request.host === "claude"
    ? claudeInstalled
      ? updateClaudeIntegration({ ...claudeRequest, proposalDigest })
      : installClaudeIntegration({ ...claudeRequest, proposalDigest })
    : installCodexIntegration({ ...codexRequest, proposalDigest });
  let installation: unknown = preview();
  let installationRecord = record(installation) ?? {};
  const previewHost = record(installationRecord.host);
  const compatibility = record(previewHost?.compatibility);
  const installationStatus = text(installationRecord.status) ?? "conflict";
  const hostHome = text(previewHost?.home) ?? (request.host === "claude" ? request.claudeHome : request.codexHome);

  if (installationStatus === "unsupported") {
    stages.push({ stage: "compatibility", status: "unsupported", summary: `the selected ${hostName} host is unsupported`, observed: compatibility });
    actions.push({
      stage: "compatibility",
      code: "select-supported-host",
      action: `select a declared ${hostName} executable and the exact declared Node runtime, then rerun setup`,
    });
  } else {
    stages.push({ stage: "compatibility", status: "complete", summary: `the selected ${hostName} host and packaged runtime are compatible`, observed: compatibility });
    completed.push("compatibility checked");
  }

  const proposal = record(installationRecord.proposal);
  const installDigest = text(proposal?.digest);
  const installedAtPreview = installationRecord.installed === true;
  if (installationStatus === "partial" && request.installProposalDigest === installDigest && installDigest !== undefined) {
    installation = yield* install(installDigest);
    installationRecord = record(installation) ?? {};
  } else if (installationStatus === "preview" && !installedAtPreview && request.installProposalDigest === installDigest && installDigest !== undefined) {
    installation = yield* install(installDigest);
    installationRecord = record(installation) ?? {};
  }

  const currentInstallationStatus = text(installationRecord.status) ?? installationStatus;
  const installed = installedAtPreview || currentInstallationStatus === "installed" || currentInstallationStatus === "already-installed" || currentInstallationStatus === "complete" || currentInstallationStatus === "updated" || currentInstallationStatus === "already-current";
  if (installed) {
    stages.push({
      stage: "installation",
      status: "complete",
      summary: currentInstallationStatus === "already-installed" || installedAtPreview
        ? `the owned ${hostName} integration is already installed`
        : `the owned ${hostName} integration was installed`,
      observed: { home: hostHome, changes: list(installationRecord.completed) },
    });
    completed.push(`owned ${hostName} integration installed`);
  } else if (currentInstallationStatus === "partial") {
    stages.push({
      stage: "installation",
      status: "partial",
      summary: "installation stopped after partial completion",
      observed: { recovery: installationRecord.recovery, proposal: installationRecord.proposal ?? proposal },
    });
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
      observed: {
        proposal: {
          digest: installDigest,
          changes: list(proposal?.changes),
          ownedChanges: proposal?.ownedChanges,
        },
      },
    });
    actions.push({
      stage: "installation",
      code: "approve-installation",
      action: "review the change summary, then rerun setup with its proposal digest",
      authorization: { installProposalDigest: installDigest },
    });
    pending.push(`approve the owned ${hostName} configuration changes`);
  } else {
    const status: StageStatus = currentInstallationStatus === "unsupported" ? "unsupported" : "conflict";
    stages.push({ stage: "installation", status, summary: `the owned ${hostName} integration could not be installed`, observed: installationRecord.error });
    actions.push({
      stage: "installation",
      code: status === "unsupported" ? "select-supported-host" : "resolve-installation-conflict",
      action: status === "unsupported"
        ? `select a supported ${hostName} executable and host configuration home, then rerun setup`
        : "preserve the selected host files, resolve the reported ownership or configuration conflict, then rerun setup",
    });
    pending.push("resolve the reported installation problem");
  }

  const rootResult = yield* discoverWorkingTreeRoot(request.scope.cwd).pipe(Effect.result);
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
      let resolution = yield* resolveCredential({
        envVar: settings.credentialEnvVar,
        environmentOnly,
      });
      let interactiveOutcome:
        | { readonly status: "cancelled" }
        | {
            readonly status: string;
            readonly generation: number;
            readonly savedCredentialUse: "active" | "suspended";
          }
        | undefined;
      if (
        request.credential === "saved" &&
        request.interactive === true &&
        resolution.source === "saved" &&
        resolution.status === "missing" &&
        options.readCredential !== undefined &&
        installed
      ) {
        const valueResult = yield* options.readCredential().pipe(Effect.result);
        if (valueResult._tag === "Success") {
          let value = valueResult.success;
          const saved = yield* saveCredential(value);
          value = "";
          if (saved.status === "stored") {
            resolution = yield* resolveCredential({
              envVar: settings.credentialEnvVar,
              environmentOnly: false,
            });
          } else {
            interactiveOutcome = {
              status: saved.status,
              generation: saved.state.generation,
              savedCredentialUse: saved.state.savedUseSuspended ? "suspended" : "active",
            };
          }
        } else interactiveOutcome = { status: "cancelled" };
      }
      if (interactiveOutcome !== undefined) {
        const indeterminate = interactiveOutcome.status === "indeterminate";
        const cancelled = interactiveOutcome.status === "cancelled";
        stages.push({
          stage: "credential",
          status: "pending",
          summary: cancelled
            ? "masked credential entry was cancelled"
            : indeterminate
              ? "credential replacement is indeterminate and saved use is suspended"
              : `credential storage returned ${interactiveOutcome.status}`,
          observed: {
            source: "saved",
            status: interactiveOutcome.status,
            inspectedContext: "setup-process",
            valueDisclosed: false,
            ...("generation" in interactiveOutcome
              ? {
                  generation: interactiveOutcome.generation,
                  savedCredentialUse: interactiveOutcome.savedCredentialUse,
                  ...(indeterminate ? {} : { previousCredentialPreserved: true }),
                }
              : { previousCredentialPreserved: true }),
          },
        });
        actions.push({
          stage: "credential",
          code: cancelled
            ? "credential-entry-cancelled"
            : indeterminate
              ? "reconcile-credential-lifecycle"
              : interactiveOutcome.status === "invalid"
                ? "replace-invalid-credential"
                : "recover-credential-storage",
          action: cancelled
            ? "rerun setup interactively or run hapsland --login in a user terminal"
            : indeterminate
              ? "run hapsland --logout to resolve the uncertain replacement, then run hapsland --login"
              : interactiveOutcome.status === "locked"
                ? "unlock the login keyring, then run hapsland --login"
                : interactiveOutcome.status === "invalid"
                  ? "run hapsland --login again and enter a nonempty credential"
                  : "reinstall an archive containing the native helper for this platform if it is missing, or repair native credential storage; then run hapsland --login",
        });
        pending.push(indeterminate ? "reconcile suspended saved credential use" : "complete saved credential login");
      } else if (resolution.status === "present") {
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

    if (request.scope.review === "disabled") {
      const excludedAll = settings.configuration.policy.excludes.some((entry) => entry.origin.layer === "user" && entry.value === "**/*");
      stages.push({
        stage: "repository",
        status: excludedAll ? "complete" : "pending",
        summary: excludedAll ? "user file settings exclude all files" : "review disablement requires a user exclusion",
        observed: { canonicalRoot: rootResult.success, effectiveIncludes: settings.configuration.policy.includes.map((entry) => entry.value) },
      });
      if (excludedAll) completed.push("user file settings disable review");
      else {
        actions.push({ stage: "repository", code: "exclude-all-files",
          action: "set excludes to [\"**/*\"] in user review settings, then rerun setup" });
        pending.push("exclude all files in user review settings");
      }
    } else {
      stages.push({ stage: "repository", status: "complete",
        summary: "effective file settings loaded",
        observed: { canonicalRoot: rootResult.success,
          effectiveIncludes: settings.configuration.policy.includes.map((entry) => entry.value),
          effectiveExcludes: settings.configuration.policy.excludes.map((entry) => entry.value) } });
      completed.push("effective file settings loaded");
    }
  }

  if (installed) {
    stages.push({
      stage: "host-trust",
      status: "unknown",
      summary: `${hostName} native repository and hook trust cannot be queried offline`,
      observed: { trustRecordsModified: false, bypassUsed: false },
    });
    actions.push({
      stage: "host-trust",
      code: "complete-native-trust",
      action: `start ${hostName} normally in the canonical repository and complete any native repository or hook review prompt`,
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
  const repositoryStage = stages.find((stage) => stage.stage === "repository");
  const status = blockingStage?.status === "unsupported"
    ? "unsupported"
    : blockingStage?.status === "conflict"
      ? "conflict"
      : blockingStage?.status === "partial"
        ? "partial"
        : request.scope.review === "disabled" && installed && repositoryStage?.status === "complete"
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
    ...(status === "completed" && request.scope.review === "enabled" && request.host === "codex"
      ? {
          optionalNextSteps: [{
            operation: "demo" as const,
            selection: "preview" as const,
            paid: false as const,
            action: "optionally preview the separate synthetic first-review demo; live execution requires an explicit selection for its disposable root",
          }],
        }
      : {}),
  };
});

export * as Setup from "./setup.ts";
