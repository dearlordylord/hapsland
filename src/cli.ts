#!/usr/bin/env node
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { homedir } from "node:os";
import { join } from "node:path";
import { closeSync, constants, openSync, readFileSync, readSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Consent, rootRelativePath } from "./runtime/consent.ts";
import {
  DEFAULT_BACKEND,
  DEFAULT_CREDENTIAL_ENV_VAR,
  DEFAULT_DESTINATION,
  loadReviewSettings,
  type ReviewSettings,
} from "./runtime/review-config.ts";
import { liveLayer as jevDecisionModelLiveLayer } from "./jev-decision.ts";
import {
  decodeCodexJson,
  toCodexOutput,
  toReviewRequest,
} from "./adapters/codex.ts";
import { explainPath, formatPathExplanation } from "./explanation/index.ts";
import { decodeReviewRequest, type ReviewRequest } from "./domain/contracts.ts";
import { ReviewBackend } from "./ports/review-backend.ts";
import { BackendError } from "./domain/errors.ts";
import { DedupeStore } from "./ports/dedupe-store.ts";
import { SnapshotReader } from "./ports/snapshot-reader.ts";
import { ReceiptStore } from "./ports/receipt-store.ts";
import { formatHuman as formatReceiptStatus, read as readReceiptStatus } from "./receipts/status.ts";
import type { ReceiptOutcomeInput } from "./ports/receipt-store.ts";
import { DiagnosticStore } from "./diagnostics/store.ts";
import {
  eventFromOutcomeCodes,
  makeDiagnosticScope,
  type DiagnosticObservation,
} from "./diagnostics/domain.ts";
import type { ReviewContext } from "./runtime/review.ts";
import { review } from "./runtime/review.ts";
import {
  controlledDecisionModelLayer,
  type ControlledDecisionModelOptions,
} from "./test-support/controlled-decision-model.ts";
import { runEvaluationCommand } from "./evaluation/command.ts";
import {
  adaptCodexDirectEvent,
  adaptCodexReply,
  isCodexNativeApplyPatch,
} from "./direct-event/adapter.ts";
import type { CodexDirectEventOutput } from "./direct-event/pipeline.ts";
import { attemptCodexHostOutput } from "./direct-event/writer.ts";
import {
  acknowledgeAdvice,
  admitObservation,
  collectReady,
  ensureResident,
  inspectResident,
  makeResidentDispatchContext,
  type CollectedAdvice,
} from "./resident/client.ts";
import {
  installCodexIntegration,
  previewCodexInstallation,
  uninstallCodexIntegration,
} from "./onboarding/codex-installation.ts";
import {
  logoutCredential,
  readCredentialState,
  resolveCredential,
  runSecretService,
  saveCredential,
} from "./credentials/secret-service.ts";
import { readActivity, formatActivityHuman, recordActivity } from "./activity/status.ts";
import { diagnoseInstalledIntegration, type DoctorCheck } from "./onboarding/doctor.ts";

const readStdin = Effect.try({
  try: () => readFileSync(0, "utf8"),
  catch: () => new Error("could not read stdin"),
});

const decodeJson = (input: string) =>
  Effect.try({
    try: () => JSON.parse(input) as unknown,
    catch: () => new Error("stdin is not valid JSON"),
  });

const ControlledOptions = Schema.Struct({
  answers: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Union([
        Schema.Struct({
          _tag: Schema.Literal("Probability"),
          probability: Schema.Number,
        }),
        Schema.Struct({
          _tag: Schema.Literal("Classify"),
          label: Schema.String,
          probabilities: Schema.Record(Schema.String, Schema.Number),
          confidence: Schema.optionalKey(Schema.Number),
        }),
        Schema.Struct({
          _tag: Schema.Literal("Rate"),
          rating: Schema.Number,
          probabilities: Schema.Record(Schema.String, Schema.Number),
          confidence: Schema.optionalKey(Schema.Number),
        }),
      ]),
    ),
  ),
  delayMs: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  failure: Schema.optionalKey(Schema.String),
  capturePath: Schema.optionalKey(Schema.String),
  outcomePath: Schema.optionalKey(Schema.String),
  requireCredential: Schema.optionalKey(Schema.Boolean),
});

const controlledOptions = Config.String("REVIEW_CONTROL_JSON").pipe(
  Config.withDefault("{}"),
  Effect.flatMap((encoded) =>
    decodeJson(encoded).pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(ControlledOptions, {
          onExcessProperty: "error",
        }),
      ),
    ),
  ),
);

const ConsentOperation = Schema.Union([
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("enable"),
    cwd: Schema.String,
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("enable-confirm"),
    cwd: Schema.String,
    proposalDigest: Consent.ProposalDigest,
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("disable"),
    cwd: Schema.String,
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("credentials"),
    cwd: Schema.String,
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("status"),
    cwd: Schema.String,
    sessionId: Schema.optionalKey(Schema.NonEmptyString),
    format: Schema.optionalKey(Schema.Literals(["json", "human"])),
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("explain"),
    cwd: Schema.String,
    path: Schema.String,
  }),
]);
type ConsentOperation = typeof ConsentOperation.Type;

const InstallationOperation = Schema.Union([
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("doctor"),
    cwd: Schema.String,
    codexHome: Schema.optionalKey(Schema.NonEmptyString),
    codexExecutable: Schema.optionalKey(Schema.NonEmptyString),
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("install-preview"),
    codexHome: Schema.optionalKey(Schema.NonEmptyString),
    codexExecutable: Schema.optionalKey(Schema.NonEmptyString),
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("install"),
    codexHome: Schema.optionalKey(Schema.NonEmptyString),
    codexExecutable: Schema.optionalKey(Schema.NonEmptyString),
    proposalDigest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  }),
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("uninstall"),
    codexHome: Schema.optionalKey(Schema.NonEmptyString),
    proposalDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
  }),
]);
type InstallationOperation = typeof InstallationOperation.Type;

const statePathConfig = Config.String("REVIEW_STATE_PATH").pipe(
  Config.orElse(() => Config.String("REVIEW_CONSENT_FILE")),
  Config.withDefault(join(homedir(), ".config", "realtime-review-tool", "consent")),
);

const receiptPathConfig = Config.String("REVIEW_RECEIPT_PATH").pipe(
  Config.orElse(() => Config.String("REVIEW_RECEIPTS_PATH")),
  Config.withDefault(join(homedir(), ".local", "state", "realtime-review-tool", "receipts")),
);

const diagnosticPathConfig = Config.String("REVIEW_DIAGNOSTIC_PATH").pipe(
  Config.orElse(() => Config.String("REVIEW_DIAGNOSTICS_PATH")),
  Config.withDefault(join(homedir(), ".local", "state", "realtime-review-tool", "diagnostics")),
);

const activityPathConfig = Config.String("REVIEW_ACTIVITY_PATH").pipe(
  Config.withDefault(join(homedir(), ".local", "state", "realtime-review-tool", "activity")),
);

const userConfigPathConfig = Config.option(Config.String("REVIEW_USER_CONFIG_PATH"));

const forcedOperation = (): ConsentOperation["operation"] | undefined => {
  if (process.argv.includes("--enable-confirm")) return "enable-confirm";
  if (process.argv.includes("--enable")) return "enable";
  if (process.argv.includes("--disable")) return "disable";
  if (
    process.argv.includes("--inspect-credentials") ||
    process.argv.includes("--credentials")
  ) {
    return "credentials";
  }
  if (process.argv.includes("--status") || process.argv.includes("--inspect-consent")) {
    return "status";
  }
  if (process.argv.includes("--explain") || process.argv.includes("--config-explain")) {
    return "explain";
  }
  return undefined;
};

const forcedInstallationOperation = (): InstallationOperation["operation"] | undefined => {
  if (process.argv.includes("--doctor")) return "doctor";
  if (process.argv.includes("--install-preview")) return "install-preview";
  if (process.argv.includes("--install")) return "install";
  if (process.argv.includes("--uninstall")) return "uninstall";
  return undefined;
};

const decodeInstallationOperation = (
  input: string,
  forced: InstallationOperation["operation"] | undefined,
) =>
  decodeJson(input).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(InstallationOperation, { onExcessProperty: "error" }),
    ),
    Effect.flatMap((operation) =>
      forced !== undefined && operation.operation !== forced
        ? Effect.fail(new Error("installation operation flag does not match the request"))
        : Effect.succeed(operation),
    ),
  );

type EvaluationOperationName = "plan" | "run" | "report";

const forcedEvaluationOperation = (): EvaluationOperationName | undefined => {
  if (process.argv.includes("--evaluation-plan")) return "plan";
  if (process.argv.includes("--evaluation-run")) return "run";
  if (process.argv.includes("--evaluation-report")) return "report";
  return undefined;
};

const forcedStatusFormat = (): "human" | undefined =>
  process.argv.includes("--status-human") || process.argv.includes("--human")
    ? "human"
    : undefined;

const decodeOperation = (input: string, forced: ConsentOperation["operation"] | undefined) =>
  decodeJson(input).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(ConsentOperation, {
        onExcessProperty: "error",
      })(value),
    ),
    Effect.flatMap((operation) =>
      forced !== undefined && operation.operation !== forced
        ? Effect.fail(new Error("operation flag does not match the request"))
        : Effect.succeed(operation),
    ),
  );

const defaultResponse = (
  request: ReviewRequest,
  code: "backend_unavailable" | "missing_credentials" | "invalid_configuration",
  reason: string,
) => ({
  version: 1 as const,
  eventId: request.event.id,
  results: request.event.paths.map((path) => ({
    status: "unavailable" as const,
    path,
    reason,
    retryable: false,
    code,
  })),
  advice: [],
});

const assertNever = (value: never): never => {
  throw new Error(`unsupported consent operation: ${String(value)}`);
};

const preflight = (
  request: ReviewRequest,
  statePath: string,
  userConfigPath: string | undefined,
) =>
  Effect.gen(function* () {
    const consent = yield* Consent.Service;
    const discovered = yield* consent.discoverRoot(request.event.cwd).pipe(Effect.result);
    if (discovered._tag === "Failure") {
      return {
        consent,
        root: undefined,
        settings: {
          backend: DEFAULT_BACKEND,
          destination: DEFAULT_DESTINATION,
          credentialEnvVar: DEFAULT_CREDENTIAL_ENV_VAR,
          projectRequestedConsent: false,
        },
        authorization: {
          status: "unsupported" as const,
          reason: "review is unsupported outside a discoverable Git working tree",
        },
      };
    }
    const root = discovered.success;
    const settings = yield* loadReviewSettings(
      root,
      userConfigPath === undefined ? {} : { userConfigPath },
    );
    const authorization = yield* consent.authorize(
      request.event.cwd,
      settings.backend,
      settings.destination,
    );
    return { consent, root, settings, authorization };
  }).pipe(Effect.provide(Consent.layer({ statePath })));

const noConsentResponse = (
  request: ReviewRequest,
  authorization: Extract<Consent.Authorization, { status: "missing-consent" | "unsupported" }>,
) => ({
  version: 1 as const,
  eventId: request.event.id,
  results: request.event.paths.map((path) => ({
    status: "skipped" as const,
    path,
    reason:
      authorization.status === "unsupported"
        ? authorization.reason
        : "repository review consent is required; run the explicit enable operation",
    code:
      authorization.status === "unsupported"
        ? ("unsupported_repository" as const)
        : ("missing_consent" as const),
  })),
  advice: [],
});

const runtimeLayer = (
  controlled: ControlledDecisionModelOptions | undefined,
  settings: ReviewSettings,
  credentialCapability?: {
    readonly generation: number;
    readonly source: "environment" | "saved";
    readonly statePath?: string;
  },
) => {
  const decisionModel =
    controlled === undefined
      ? jevDecisionModelLiveLayer({
          apiUrl: settings.apiBase,
          credentialEnvVar: settings.credentialEnvVar,
        })
      : controlledDecisionModelLayer(controlled);
  const backendLayer = ReviewBackend.layerWithOptions({
    transientRetries: settings.configuration.policy.settings.transientRetries.value,
    ...(credentialCapability === undefined ? {} : {
      beforeDispatch: Effect.suspend(() => {
        const current = readCredentialState(credentialCapability.statePath);
        return current.generation === credentialCapability.generation &&
            (credentialCapability.source === "environment" || !current.savedUseSuspended)
          ? Effect.void
          : Effect.fail(new BackendError({
              reason: "review credential changed before provider dispatch",
              retryable: false,
            }));
      }),
    }),
  });
  return Layer.mergeAll(
    SnapshotReader.layer,
    DedupeStore.layer,
    backendLayer.pipe(Layer.provide(decisionModel)),
  );
};

const runRequest = (
  request: ReviewRequest,
  controlled: ControlledDecisionModelOptions | undefined,
  settings: ReviewSettings,
  context: ReviewContext,
  credentialCapability?: {
    readonly generation: number;
    readonly source: "environment" | "saved";
    readonly statePath?: string;
  },
) => review(request, context).pipe(
  Effect.provide(runtimeLayer(controlled, settings, credentialCapability)),
);

const isCodexHook = process.argv.includes("--codex-hook");
const isControlled = process.argv.includes("--controlled");
const isControlledWriter = process.argv.includes("--controlled-writer");
const requestedOperation = forcedOperation();
const requestedInstallationOperation = forcedInstallationOperation();
const requestedEvaluationOperation = forcedEvaluationOperation();

type DirectHookDispatch =
  | { readonly handled: false }
  | { readonly handled: true; readonly output: unknown };

const runDirectCodexHook = (
  nativeEvent: unknown,
  controlled: ControlledDecisionModelOptions | undefined,
  statePath: string,
  activityPath: string,
  userConfigPath: string | undefined,
): Effect.Effect<DirectHookDispatch, unknown> =>
  Effect.gen(function* () {
    const record = typeof nativeEvent === "object" && nativeEvent !== null
      ? nativeEvent as Readonly<Record<string, unknown>>
      : undefined;
    const isBash = record?.hook_event_name === "PostToolUse" && record.tool_name === "Bash";
    if (!isCodexNativeApplyPatch(nativeEvent) && !isBash) return { handled: false } as const;
    // Every mapped hook ensures the singleton, including Bash collection-only
    // replies and installations where no initialization command was run.
    const reply = yield* adaptCodexReply(nativeEvent);
    const owner = yield* Effect.tryPromise(() => ensureResident()).pipe(Effect.option);
    if (Option.isNone(owner)) {
      if (!isBash && reply !== undefined) {
        recordActivity({ statePath: activityPath, root: reply.root, recipient: reply.recipient, lifetime: "resident-unavailable", stage: "unavailable" });
      }
      return { handled: true, output: {} } as const;
    }
    const dispatch = reply === undefined
      ? undefined
      : yield* Effect.tryPromise(() => makeResidentDispatchContext(
          reply.root,
          statePath,
          activityPath,
          userConfigPath,
          controlled,
        )).pipe(Effect.catch(() => Effect.succeed(undefined)));
    const collected = reply === undefined || dispatch === undefined
      ? undefined
      : yield* Effect.tryPromise(() => collectReady(reply.root, reply.recipient, dispatch)).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        );
    // Bash has no path adaptation and can never create backend work.
    if (isBash) {
      return collected === undefined
        ? { handled: true, output: {} } as const
        : { handled: true, output: { _tag: "DirectEventReady" as const, value: collected.output, collected } } as const;
    }
    const observation = yield* adaptCodexDirectEvent(nativeEvent);
    // The direct dispatcher owns every native apply_patch event. Unsupported
    // shapes remain quiet and can never reach the legacy whole-file runtime.
    if (observation === undefined) {
      if (reply !== undefined) {
        recordActivity({ statePath: activityPath, root: reply.root, recipient: reply.recipient, lifetime: owner.value.lifetime, stage: "incomplete" });
      }
      return collected === undefined
        ? { handled: true, output: {} } as const
        : { handled: true, output: { _tag: "DirectEventReady" as const, value: collected.output, collected } } as const;
    }
    // Matching reads are not attribution. The hook command must explicitly be
    // installed with this controlled-writer assertion for the supported Add profile.
    if (dispatch === undefined) {
      recordActivity({ statePath: activityPath, root: observation.root, recipient: observation.recipient, lifetime: owner.value.lifetime, stage: "unavailable" });
    } else if (!isControlledWriter) {
      recordActivity({ statePath: activityPath, root: observation.root, recipient: observation.recipient, lifetime: owner.value.lifetime, stage: "unavailable" });
    } else {
      yield* Effect.tryPromise(() => admitObservation(observation, true, dispatch)).pipe(
        Effect.catch(() => {
          recordActivity({ statePath: activityPath, root: observation.root, recipient: observation.recipient, lifetime: owner.value.lifetime, stage: "unavailable" });
          return Effect.void;
        }),
      );
    }
    return collected === undefined
      ? { handled: true, output: {} } as const
      : { handled: true, output: { _tag: "DirectEventReady" as const, value: collected.output, collected } } as const;
  });

const isDirectEventReady = (
  value: unknown,
): value is {
  readonly _tag: "DirectEventReady";
  readonly value: CodexDirectEventOutput;
  readonly collected: CollectedAdvice;
} =>
  typeof value === "object" &&
  value !== null &&
  "_tag" in value &&
  value._tag === "DirectEventReady" &&
  "value" in value;

const runOperation = (
  operation: ConsentOperation,
  statePath: string,
  receiptPath: string,
  activityPath: string,
  userConfigPath: string | undefined,
) =>
  Effect.gen(function* () {
    const consent = yield* Consent.Service;
    const cwd = operation.cwd;
    const root = yield* consent.discoverRoot(cwd);
    /**
     * Status is observational: a malformed current configuration must be
     * reported as readiness state, not prevent an explicit session receipt
     * from being read.  It also deliberately stops before constructing any
     * review/backend layer.
     */
    if (operation.operation === "status") {
      const configuration = yield* loadReviewSettings(
        root,
        userConfigPath === undefined ? {} : { userConfigPath },
      ).pipe(Effect.result);
      const settings = configuration._tag === "Success" ? configuration.success : undefined;
      const backend = settings?.backend ?? DEFAULT_BACKEND;
      const destination = settings?.destination ?? DEFAULT_DESTINATION;
      const credentialEnvVar = settings?.credentialEnvVar ?? DEFAULT_CREDENTIAL_ENV_VAR;
      const grants = yield* consent.list();
      const authorization = yield* consent
        .authorize(cwd, backend, destination)
        .pipe(Effect.result);
      const credentialResolution = yield* Effect.promise(() => resolveCredential({
        envVar: credentialEnvVar,
        environmentOnly: settings !== undefined &&
          settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in",
      }));
      const credentials = credentialResolution.status === "present";
      const configurationStatus = settings === undefined ? "invalid" : "ready";
      const readinessStatus =
        configurationStatus === "ready" &&
        authorization._tag === "Success" &&
        authorization.success.status === "approved" &&
        credentials
          ? "ready"
          : "not-ready";
      const activity =
        operation.sessionId === undefined
          ? yield* readReceiptStatus("")
          : yield* readReceiptStatus(operation.sessionId);
      const resident = yield* Effect.promise(() => inspectResident());
      const residentActivity = readActivity({
        statePath: activityPath,
        root,
        sessionId: operation.sessionId ?? "",
        resident,
      });
      const primaryActivity = residentActivity.observed ? residentActivity : activity;
      const output = {
        version: 1,
        operation: "status",
        repository: { canonicalRoot: root },
        ...(operation.sessionId === undefined ? {} : { sessionId: operation.sessionId }),
        readiness: {
          status: readinessStatus,
          configuration: configurationStatus,
          consent:
            authorization._tag === "Failure"
              ? "unavailable"
              : authorization.success.status,
          credentials: {
            envVar: credentialEnvVar,
            present: credentials,
            source: credentialResolution.source,
            status: credentialResolution.status,
          },
        },
        activity: primaryActivity,
        activitySource: residentActivity.observed ? "resident-v1" : "legacy-receipt-v1",
        evidence: {
          resident: residentActivity,
          legacyReceipt: activity,
        },
        grants: grants.map((grant) => ({
          backend: grant.backend,
          destination: grant.destination,
          scope: "repository-wide eligible source files",
        })),
        projectAuthorizationIgnored: settings?.projectRequestedConsent ?? false,
      };
      return operation.format === "human"
        ? `${formatReceiptStatus(
            operation.sessionId ?? "<session id required>",
            `${readinessStatus} (configuration=${configurationStatus}, consent=${output.readiness.consent}, credentials=${credentials ? "present" : "absent"})`,
            activity,
          )}${formatActivityHuman(operation.sessionId ?? "<session id required>", residentActivity)}`
        : output;
    }
    const settings = yield* loadReviewSettings(
      root,
      userConfigPath === undefined ? {} : { userConfigPath },
    );
    const backend = settings.backend;
    const destination = settings.destination;
    const credentialEnvVar = settings.credentialEnvVar;
    switch (operation.operation) {
      case "enable": {
        const proposal = yield* consent.preview(cwd, backend, destination);
        return {
          version: 1,
          operation: "enable",
          status: "preview",
          proposal: {
            digest: proposal.digest,
            repository: { canonicalRoot: proposal.target.root },
            backend: {
              id: proposal.target.backend,
              destination: proposal.target.destination,
            },
            scope: proposal.scope,
          },
          projectAuthorizationIgnored: settings.projectRequestedConsent,
        };
      }
      case "enable-confirm": {
        const proposal = yield* consent.preview(cwd, backend, destination);
        if (proposal.digest !== operation.proposalDigest) {
          return {
            version: 1,
            operation: "enable-confirm",
            status: "proposal-mismatch",
            proposalDigest: operation.proposalDigest,
            currentProposalDigest: proposal.digest,
            repository: { canonicalRoot: proposal.target.root },
            scope: proposal.scope,
          };
        }
        const identity = yield* consent.enable(proposal);
        return {
          version: 1,
          operation: "enable-confirm",
          status: "enabled",
          repository: { canonicalRoot: identity.root },
          backend: { id: identity.backend, destination: identity.destination },
          scope: proposal.scope,
          projectAuthorizationIgnored: settings.projectRequestedConsent,
        };
      }
      case "disable": {
        const revoked = yield* consent.disable(cwd, backend, destination);
        return {
          version: 1,
          operation: "disable",
          status: revoked ? "disabled" : "already-disabled",
          repository: { canonicalRoot: root },
          backend: { id: backend, destination },
          scope: "future dispatches only",
        };
      }
      case "credentials": {
        const resolution = yield* Effect.promise(() => resolveCredential({
          envVar: credentialEnvVar,
          environmentOnly:
            settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in",
        }));
        return {
          version: 1,
          operation: "credentials",
          credentialEnvVar,
          present: resolution.status === "present",
          source: resolution.source,
          status: resolution.status,
        };
      }
      case "explain": {
        const relativePath = rootRelativePath(root, cwd, operation.path);
        const policy = settings.configuration.policy;
        const explanation = explainPath(policy, relativePath ?? operation.path);
        return {
          version: 1,
          operation: "explain",
          repository: { canonicalRoot: root },
          explanation,
          text: formatPathExplanation(explanation),
        };
      }
      default:
        return assertNever(operation);
    }
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Consent.layer({ statePath }),
        ReceiptStore.layer({ statePath: receiptPath }),
      ),
    ),
  );

const runReviewRequestCore = (
  request: ReviewRequest,
  controlled: ControlledDecisionModelOptions | undefined,
  statePath: string,
  userConfigPath: string | undefined,
) =>
  Effect.gen(function* () {
    const authorization = yield* preflight(request, statePath, userConfigPath).pipe(Effect.result);
    if (authorization._tag === "Failure") {
      const failure = authorization.failure;
      const detail =
        typeof failure === "object" && failure !== null &&
        "source" in failure && "field" in failure && "reason" in failure
          ? `${String(failure.source)}#${String(failure.field)}: ${String(failure.reason)}`
          : failure instanceof Error
            ? failure.message
            : undefined;
      return {
        response: defaultResponse(
          request,
          "invalid_configuration",
          detail === undefined
            ? "review configuration or consent state is unavailable"
            : `review configuration is invalid (${detail})`,
        ),
        diagnosticScope: makeDiagnosticScope(
          request.event.sessionId ?? request.event.id,
          request.event.cwd,
          DEFAULT_BACKEND,
        ),
      };
    }
    const diagnosticScope = makeDiagnosticScope(
      request.event.sessionId ?? request.event.id,
      authorization.success.root ?? request.event.cwd,
      authorization.success.settings.backend,
    );
    if (authorization.success.authorization.status !== "approved") {
      return {
        response: noConsentResponse(request, authorization.success.authorization),
        diagnosticScope,
      };
    }
    const credentialStatePath = process.env.REVIEW_CREDENTIAL_STATE_PATH;
    const credential = controlled === undefined
      ? yield* Effect.promise(() => resolveCredential({
          envVar: authorization.success.settings.credentialEnvVar,
          environmentOnly:
            "configuration" in authorization.success.settings &&
            authorization.success.settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in",
          ...(credentialStatePath === undefined ? {} : { statePath: credentialStatePath }),
        }))
      : undefined;
    if (controlled === undefined && credential?.status !== "present") {
        return {
          response: defaultResponse(
            request,
            "missing_credentials",
            credential?.source === "environment"
              ? `review credential is unavailable; set ${authorization.success.settings.credentialEnvVar}`
              : `saved review credential is ${credential?.status ?? "unavailable"}; run review-tool --login`,
          ),
          diagnosticScope,
        };
    }
    if (authorization.success.root === undefined) {
      return {
        response: defaultResponse(
          request,
          "invalid_configuration",
          "review working-tree identity is unavailable",
        ),
        diagnosticScope,
      };
    }
    if (credential?.status === "present") {
      const current = readCredentialState(credentialStatePath);
      if (current.generation !== credential.generation ||
          (credential.source === "saved" && current.savedUseSuspended)) {
        return {
          response: defaultResponse(
            request,
            "missing_credentials",
            "review credential changed before dispatch; retry the edit",
          ),
          diagnosticScope,
        };
      }
    }
    const requestEffect = runRequest(
      request,
      controlled,
      authorization.success.settings,
      {
        _tag: "authorized",
        root: authorization.success.root,
        consent: authorization.success.consent,
        settings: authorization.success.settings,
      },
      credential?.status === "present"
        ? {
            generation: credential.generation,
            source: credential.source,
            ...(credentialStatePath === undefined ? {} : { statePath: credentialStatePath }),
          }
        : undefined,
    );
    const credentialProvider = credential?.status === "present"
      ? ConfigProvider.layer(ConfigProvider.fromUnknown({
          [authorization.success.settings.credentialEnvVar]: credential.value,
        }))
      : undefined;
    const response = yield* (credentialProvider === undefined
      ? requestEffect
      : requestEffect.pipe(Effect.provide(credentialProvider))).pipe(
      Effect.catchCause(() =>
        Effect.succeed(
          defaultResponse(
            request,
            "backend_unavailable",
            "review backend unavailable; the completed edit was preserved",
          ),
        ),
      ),
    );
    return { response, diagnosticScope };
  });

const receiptOutcomes = (response: { readonly results: ReadonlyArray<{ readonly status: string; readonly code?: string }> }):
  ReadonlyArray<ReceiptOutcomeInput> =>
  response.results.flatMap((result) => {
    if (
      result.status === "reviewed" ||
      result.status === "skipped" ||
      result.status === "unavailable"
    ) {
      return [{ status: result.status, ...(result.code === undefined ? {} : { code: result.code }) }];
    }
    return [];
  });

/**
 * Receipt writes are observational.  A failed local write must not turn the
 * already-completed host edit into a review failure or alter protocol output.
 */
const runReviewRequest = (
  request: ReviewRequest,
  controlled: ControlledDecisionModelOptions | undefined,
  statePath: string,
  diagnosticPath: string,
  userConfigPath: string | undefined,
) =>
  Effect.gen(function* () {
    const receipt = yield* ReceiptStore.Service;
    const sessionId = request.event.sessionId;
    if (sessionId !== undefined) {
      yield* receipt
        .start({
          sessionId,
          eventId: request.event.id,
          expectedResults: request.event.paths.length,
        })
        .pipe(Effect.catch(() => Effect.succeed(undefined)));
    }
    const core = yield* runReviewRequestCore(
      request,
      controlled,
      statePath,
      userConfigPath,
    );
    const outcomeCodes = core.response.results.flatMap((result) =>
      result.status === "reviewed" ? [] : [result.code],
    );
    const diagnosticEvent = eventFromOutcomeCodes(
      core.diagnosticScope,
      outcomeCodes,
    );
    const diagnostic = yield* DiagnosticStore.Service;
    // Diagnostic persistence is best effort. A persistence failure must not
    // prevent receipt completion or alter the review outcome for the edit.
    const observation = yield* diagnostic.observe(diagnosticEvent).pipe(
      Effect.catch(() =>
        Effect.succeed({
          ...diagnosticEvent,
          suppressed: true,
        } satisfies DiagnosticObservation),
      ),
    );
    const response = {
      ...core.response,
      diagnostics: [observation],
    };
    if (sessionId !== undefined) {
      yield* receipt
        .complete({
          sessionId,
          eventId: request.event.id,
          expectedResults: request.event.paths.length,
          outcomes: receiptOutcomes(response),
          findings: response.advice.length,
        })
        .pipe(Effect.catch(() => Effect.succeed(undefined)));
    }
    return response;
  });

const program = Effect.gen(function* () {
  const input = yield* readStdin;
  const statePath = yield* statePathConfig;
  const receiptPath = yield* receiptPathConfig;
  const diagnosticPath = yield* diagnosticPathConfig;
  const activityPath = yield* activityPathConfig;
  const userConfigPathOption = yield* userConfigPathConfig;
  const userConfigPath = Option.isSome(userConfigPathOption)
    ? userConfigPathOption.value
    : undefined;

  const inputRequestsOperation = /"operation"\s*:\s*"(?:enable|enable-confirm|disable|credentials|status|explain)"/.test(
    input,
  );
  const inputRequestsInstallation = /"operation"\s*:\s*"(?:doctor|install-preview|install|uninstall)"/.test(input);
  const inputRequestsEvaluation = /"operation"\s*:\s*"(?:plan|run|report)"/.test(input);
  if (requestedEvaluationOperation !== undefined || inputRequestsEvaluation) {
    const evaluationInput = yield* decodeJson(input);
    if (
      typeof evaluationInput !== "object" ||
      evaluationInput === null ||
      !("operation" in evaluationInput) ||
      (requestedEvaluationOperation !== undefined &&
        evaluationInput.operation !== requestedEvaluationOperation)
    ) {
      return {
        version: 1,
        error: {
          code: "invalid_request",
          message: "evaluation operation flag does not match the version-1 evaluation contract",
        },
      };
    }
    return yield* runEvaluationCommand(evaluationInput, {
      allowLive: process.argv.includes("--evaluation-live"),
      credentialEnvVar: process.env.EVALUATION_CREDENTIAL_ENV ?? "TYPESAFE_API_KEY",
      ...(isControlled ? { controlled: yield* controlledOptions } : {}),
    });
  }
  if (requestedInstallationOperation !== undefined || inputRequestsInstallation) {
    const operation = yield* decodeInstallationOperation(input, requestedInstallationOperation);
    const request = {
      ...(operation.codexHome === undefined ? {} : { codexHome: operation.codexHome }),
      ...(!("codexExecutable" in operation) || operation.codexExecutable === undefined
        ? {}
        : { codexExecutable: operation.codexExecutable }),
      ...(!("proposalDigest" in operation) || operation.proposalDigest === undefined
        ? {}
        : { proposalDigest: operation.proposalDigest }),
    };
    switch (operation.operation) {
      case "doctor": {
        const repositoryResult = yield* Effect.gen(function* () {
          const consent = yield* Consent.Service;
          const rootResult = yield* consent.discoverRoot(operation.cwd).pipe(Effect.result);
          if (rootResult._tag === "Failure") {
            return {
              repository: {
                stage: "repository-enablement",
                status: "unsupported",
                observed: "working tree could not be discovered",
                action: "run doctor from a supported Git working tree",
              } satisfies DoctorCheck,
              credential: {
                stage: "credential-accessibility",
                status: "unknown",
                observed: {
                  inspectedContext: "doctor-process",
                  configuredEnvironmentVariable: "unknown",
                  doctorProcessEnvironment: "unknown-not-inspected",
                  actualHookAccessibility: "unknown",
                  savedCredentialAccessibility: "unknown-not-inspected-by-this-version",
                  reason: "repository configuration is unavailable",
                },
                action: "fix repository discovery, then rerun doctor without passing any secret",
              } satisfies DoctorCheck,
            };
          }
          const settingsResult = yield* loadReviewSettings(
            rootResult.success,
            userConfigPath === undefined ? {} : { userConfigPath },
          ).pipe(Effect.result);
          if (settingsResult._tag === "Failure") {
            return {
              repository: {
                stage: "repository-enablement",
                status: "conflict",
                observed: "review configuration is invalid",
                action: "repair the reported review configuration, then rerun doctor",
              } satisfies DoctorCheck,
              credential: {
                stage: "credential-accessibility",
                status: "unknown",
                observed: {
                  inspectedContext: "doctor-process",
                  configuredEnvironmentVariable: "unknown",
                  doctorProcessEnvironment: "unknown-not-inspected",
                  actualHookAccessibility: "unknown",
                  savedCredentialAccessibility: "unknown-not-inspected-by-this-version",
                  reason: "credential selection could not be resolved",
                },
                action: "repair review configuration, then rerun doctor without passing any secret",
              } satisfies DoctorCheck,
            };
          }
          const settings = settingsResult.success;
          const authorization = yield* consent.authorize(
            operation.cwd,
            settings.backend,
            settings.destination,
          ).pipe(Effect.result);
          const credential = yield* Config.option(Config.String(settings.credentialEnvVar)).pipe(
            Effect.map((value) => Option.isSome(value) && value.value.length > 0),
          );
          return {
            repository: authorization._tag === "Success" && authorization.success.status === "approved"
              ? { stage: "repository-enablement", status: "ready", observed: "enabled for the canonical repository" } satisfies DoctorCheck
              : {
                  stage: "repository-enablement",
                  status: authorization._tag === "Failure" ? "unknown" : "missing",
                  observed: authorization._tag === "Failure" ? "consent state unavailable" : authorization.success.status,
                  action: "preview and explicitly enable review for this canonical repository",
                } satisfies DoctorCheck,
            credential: {
              stage: "credential-accessibility",
              status: "unknown",
              observed: {
                inspectedContext: "doctor-process",
                configuredEnvironmentVariable: settings.credentialEnvVar,
                doctorProcessEnvironment: credential ? "present" : "absent",
                actualHookAccessibility: "unknown",
                savedCredentialAccessibility: "unknown-not-inspected-by-this-version",
              },
              action: credential
                ? "launch the selected host from this environment, then verify one controlled hook event"
                : `make ${settings.credentialEnvVar} available to the hook context or use the supported login operation`,
            } satisfies DoctorCheck,
          };
        }).pipe(Effect.provide(Consent.layer({ statePath })));
        return yield* Effect.promise(() => diagnoseInstalledIntegration({
          installation: request,
          repository: repositoryResult.repository,
          credential: repositoryResult.credential,
        }));
      }
      case "install-preview":
        return previewCodexInstallation(request);
      case "install":
        return yield* Effect.promise(() => installCodexIntegration(request));
      case "uninstall":
        return yield* Effect.promise(() => uninstallCodexIntegration(request));
    }
  }
  if (requestedOperation !== undefined || inputRequestsOperation) {
    const decodedOperation = yield* decodeOperation(input, requestedOperation);
    const operation =
      forcedStatusFormat() !== undefined && decodedOperation.operation === "status"
        ? { ...decodedOperation, format: "human" as const }
        : decodedOperation;
    if (operation.operation !== undefined) {
      return yield* runOperation(operation, statePath, receiptPath, activityPath, userConfigPath);
    }
  }

  const controlled = isControlled ? yield* controlledOptions : undefined;

  if (isCodexHook) {
    const nativeEvent = yield* decodeJson(input);
    const direct = yield* runDirectCodexHook(
      nativeEvent,
      controlled,
      statePath,
      activityPath,
      userConfigPath,
    );
    if (direct.handled) return direct.output;
    const event = yield* decodeCodexJson(input);
    const request = toReviewRequest(event);
    if (request === undefined) return {};
    const response = yield* runReviewRequest(
      request,
      controlled,
      statePath,
      diagnosticPath,
      userConfigPath,
    ).pipe(
      Effect.provide(
        Layer.mergeAll(
          ReceiptStore.layer({ statePath: receiptPath }),
          DiagnosticStore.layer({ statePath: diagnosticPath }),
        ),
      ),
    );
    return toCodexOutput(response);
  }

  const unknownRequest = yield* decodeJson(input);
  const request = yield* decodeReviewRequest(unknownRequest);
  return yield* runReviewRequest(
    request,
    controlled,
    statePath,
    diagnosticPath,
    userConfigPath,
  ).pipe(
    Effect.provide(
      Layer.mergeAll(
        ReceiptStore.layer({ statePath: receiptPath }),
        DiagnosticStore.layer({ statePath: diagnosticPath }),
      ),
    ),
  );
}).pipe(
  Effect.catchCause(() =>
    Effect.succeed(
      isCodexHook
        ? {
            systemMessage:
              "Review unavailable: invalid or unsupported Codex PostToolUse input.",
          }
        : {
            version: 1,
            error: {
              code: "invalid_request",
              message: "input does not satisfy the version-1 review contract",
            },
          },
    ),
  ),
);

const readMaskedCredential = (): Promise<string> => {
  const descriptor = openSync("/dev/tty", constants.O_RDONLY | constants.O_NONBLOCK);
  const original = spawnSync("stty", ["-F", "/dev/tty", "-g"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  const originalMode = original.status === 0 ? original.stdout.trim() : "";
  if (originalMode.length === 0) {
    closeSync(descriptor);
    throw new Error("masked terminal input is unavailable; retry with --credential-stdin");
  }
  let restored = false;
  const restore = () => {
    if (restored) return;
    if (originalMode.length === 0) return;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      spawnSync("stty", ["-F", "/dev/tty", originalMode], { stdio: "ignore" });
      const observed = spawnSync("stty", ["-F", "/dev/tty", "-g"], {
        encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      });
      if (observed.status === 0 && observed.stdout.trim() === originalMode) {
        restored = true;
        return;
      }
    }
  };
  const disabled = spawnSync("stty", ["-F", "/dev/tty", "-echo"], { stdio: "ignore" });
  if (disabled.status !== 0) {
    closeSync(descriptor);
    throw new Error("masked terminal input is unavailable; retry with --credential-stdin");
  }
  process.stderr.write("Jev API key: ");
  return new Promise((resolveValue, rejectValue) => {
    const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
    const handlers = new Map<NodeJS.Signals, () => void>();
    let settled = false;
    let value = Buffer.alloc(0);
    let poll: NodeJS.Timeout | undefined;
    const finish = (result: { readonly value: string } | { readonly error: Error }) => {
      if (settled) return;
      settled = true;
      for (const [signal, handler] of handlers) process.off(signal, handler);
      if (poll !== undefined) clearInterval(poll);
      closeSync(descriptor);
      restore();
      process.stderr.write("\n");
      if ("value" in result) resolveValue(result.value);
      else rejectValue(result.error);
    };
    for (const signal of signals) {
      const handler = () => finish({ error: new Error("credential input cancelled") });
      handlers.set(signal, handler);
      process.once(signal, handler);
    }
    poll = setInterval(() => {
      try {
        const chunk = Buffer.alloc(256);
        const count = readSync(descriptor, chunk, 0, chunk.length, null);
        if (count === 0) return;
        value = Buffer.concat([value, chunk.subarray(0, count)]);
        if (value.length > 32_768) return finish({ error: new Error("credential input is too long") });
        const newline = value.findIndex((byte) => byte === 0x0a || byte === 0x0d);
        if (newline >= 0) finish({ value: value.subarray(0, newline).toString("utf8") });
      } catch (cause) {
        if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EAGAIN") return;
        finish({ error: new Error("credential input unavailable") });
      }
    }, 10);
  });
};

const runCredentialCommand = async (): Promise<Readonly<Record<string, unknown>>> => {
  if (process.argv.includes("--login")) {
    const probe = await runSecretService("probe", { deadlineMs: 2_000 });
    if (probe.status !== "available") {
      return {
        version: 1,
        operation: "login",
        status: probe.status,
        action: probe.status === "locked"
          ? "unlock the login keyring in the desktop session, then retry"
          : "start a Secret Service provider in this user session, then retry",
      };
    }
    let value: string;
    try {
      value = process.argv.includes("--credential-stdin")
        ? readFileSync(0, "utf8").replace(/\r?\n$/, "")
        : await readMaskedCredential();
    } catch {
      return {
        version: 1,
        operation: "login",
        status: "cancelled",
        preservedPreviousCredential: true,
        action: "retry in a terminal or explicitly use --credential-stdin",
      };
    }
    const result = await saveCredential(value);
    value = "";
    return {
      version: 1,
      operation: "login",
      status: result.status,
      stored: result.status === "stored",
      paidVerificationPerformed: false,
      previousCredentialPreserved: result.status !== "stored" && result.status !== "indeterminate",
      replacementOutcome: result.status === "indeterminate" ? "indeterminate" : result.status,
      savedCredentialUse: result.state.savedUseSuspended ? "suspended" : "active",
      ...(result.status === "indeterminate"
        ? { action: "credential replacement may have committed; retry login or logout before review" }
        : {}),
      generation: result.state.generation,
    };
  }
  const result = await logoutCredential();
  let environmentName = DEFAULT_CREDENTIAL_ENV_VAR;
  try {
    const repository = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 1_000,
    });
    const root = repository.status === 0 ? repository.stdout.trim() : "";
    if (root.length > 0) {
      environmentName = (await Effect.runPromise(loadReviewSettings(root))).credentialEnvVar;
    }
  } catch { /* The global default remains the only known environment override. */ }
  const environmentActive = (process.env[environmentName]?.length ?? 0) > 0;
  return {
    version: 1,
    operation: "logout",
    status: result.status === "deleted" || result.status === "missing"
      ? "logged-out"
      : "deletion-failed",
    savedCredentialUse: result.state.savedUseSuspended ? "suspended" : "absent",
    generation: result.state.generation,
    grantsPreserved: true,
    sentRequestsRecalled: false,
    environmentOverride: {
      envVar: environmentName,
      active: environmentActive,
      warning: environmentActive
        ? `${environmentName} remains active and takes precedence over saved storage`
        : undefined,
    },
  };
};

const isCredentialCommand = process.argv.includes("--login") || process.argv.includes("--logout");
const output = isCredentialCommand
  ? await runCredentialCommand()
  : await Effect.runPromise(program);
if (!isCodexHook && typeof output === "object" && output !== null) {
  const record = output as Readonly<Record<string, unknown>>;
  process.exitCode = record.status === "unsupported"
    ? 3
    : record.status === "conflict" || record.status === "proposal-mismatch"
      ? 4
      : record.status === "partial"
        ? 5
        : record.status === "deletion-failed" ||
            record.status === "locked" ||
            record.status === "unavailable" ||
            record.status === "timed-out" ||
            record.status === "indeterminate" ||
            record.status === "cancelled" ||
            record.status === "invalid"
          ? 6
        : "error" in record
          ? 2
          : 0;
}
if (isDirectEventReady(output)) {
  attemptCodexHostOutput(output.value, (encoded) => {
    process.stdout.write(encoded);
  });
  recordActivity({
    statePath: output.collected.activityPath,
    root: output.collected.root,
    recipient: output.collected.recipient,
    lifetime: output.collected.lifetime,
    stage: "submitted",
    submittedFindings: output.collected.findingCount,
  });
  await acknowledgeAdvice(output.collected);
} else {
  process.stdout.write(typeof output === "string" ? output : `${JSON.stringify(output)}\n`);
}
