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
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
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
  adaptClaudeDirectEvent,
  isCodexNativeApplyPatch,
} from "./direct-event/adapter.ts";
import { isCodexHostVersion, type CodexHostVersion } from "./direct-event/model.ts";
import type { DirectObservation } from "./direct-event/model.ts";
import { adaptOpenCodeDirectEvent } from "./hosts/opencode/adapter.ts";
import {
  claudeHostOutputText,
  encodeClaudeHostOutputLine,
  type ClaudeHostOutput,
} from "./direct-event/claude-output.ts";
import { attemptCodexHostOutput } from "./direct-event/writer.ts";
import {
  acknowledgeAdvice,
  admitObservation,
  admitTicketedObservation,
  collectOutcome,
  collectReady,
  ensureResident,
  inspectResident,
  makeResidentDispatchContext,
  type CollectedAdvice,
} from "./resident/client.ts";
import {
  installCodexIntegration,
  previewCodexInstallation,
  previewCodexUpdate,
  uninstallCodexIntegration,
  updateCodexIntegration,
} from "./onboarding/codex-installation.ts";
import {
  previewClaudeInstallation, installClaudeIntegration, previewClaudeUpdate,
  updateClaudeIntegration, uninstallClaudeIntegration, diagnoseClaudeIntegration,
} from "./onboarding/claude-installation.ts";
import {
  previewOpenCodeInstallation, installOpenCodeIntegration, previewOpenCodeUpdate,
  updateOpenCodeIntegration, uninstallOpenCodeIntegration, diagnoseOpenCodeIntegration,
} from "./onboarding/opencode-installation.ts";
import {
  logoutCredential,
  readCredentialState,
  resolveCredential,
  runSecretService,
  saveCredential,
} from "./credentials/secret-service.ts";
import { terminalModeArguments } from "./credentials/terminal.ts";
import { readActivity, formatActivityHuman, recordActivity } from "./activity/status.ts";
import { diagnoseInstalledIntegration, type DoctorCheck } from "./onboarding/doctor.ts";
import { runSetup } from "./onboarding/setup.ts";
import { runFirstReviewDemo } from "./onboarding/first-review-demo.ts";
import { recordDemoTrace } from "./onboarding/demo-trace.ts";

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

const installationOperationsFor = <const Fields extends Schema.Struct.Fields>(fields: Fields) => Schema.Union([
  Schema.Struct({ version: Schema.Literal(1), operation: Schema.Literal("doctor"), cwd: Schema.String, ...fields }),
  Schema.Struct({ version: Schema.Literal(1), operation: Schema.Literal("install-preview"), ...fields }),
  Schema.Struct({
    version: Schema.Literal(1), operation: Schema.Literal("install"), ...fields,
    proposalDigest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  }),
  Schema.Struct({ version: Schema.Literal(1), operation: Schema.Literal("update-preview"), ...fields }),
  Schema.Struct({
    version: Schema.Literal(1), operation: Schema.Literal("update"), ...fields,
    proposalDigest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  }),
  Schema.Struct({
    version: Schema.Literal(1), operation: Schema.Literal("uninstall"), ...fields,
    proposalDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
  }),
]);

const InstallationOperation = Schema.Union([
  installationOperationsFor({
    host: Schema.optionalKey(Schema.Literal("codex")),
    codexHome: Schema.optionalKey(Schema.NonEmptyString),
    codexExecutable: Schema.optionalKey(Schema.NonEmptyString),
  }),
  installationOperationsFor({
    host: Schema.Literal("claude"),
    claudeHome: Schema.optionalKey(Schema.NonEmptyString),
    claudeExecutable: Schema.optionalKey(Schema.NonEmptyString),
  }),
  installationOperationsFor({
    host: Schema.Literal("opencode"),
    opencodeConfigHome: Schema.optionalKey(Schema.NonEmptyString),
    opencodeExecutable: Schema.optionalKey(Schema.NonEmptyString),
  }),
]);
type InstallationOperation = typeof InstallationOperation.Type;

const SetupOperation = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literal("setup"),
  host: Schema.Literal("codex"),
  scope: Schema.Struct({
    cwd: Schema.NonEmptyString,
    review: Schema.Literals(["enabled", "disabled"]),
  }),
  credential: Schema.Literals(["saved", "environment", "skip"]),
  codexHome: Schema.optionalKey(Schema.NonEmptyString),
  codexExecutable: Schema.optionalKey(Schema.NonEmptyString),
  installProposalDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
  consentProposalDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
  interactive: Schema.optionalKey(Schema.Boolean),
});
type SetupOperation = typeof SetupOperation.Type;

const FirstReviewDemoOperation = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literal("demo"),
  selection: Schema.Literals(["preview", "live", "cancel"]),
  codexHome: Schema.optionalKey(Schema.NonEmptyString),
  codexExecutable: Schema.optionalKey(Schema.NonEmptyString),
  demoId: Schema.optionalKey(Schema.NonEmptyString),
  selectionDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
  consentProposalDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
});
type FirstReviewDemoOperation = typeof FirstReviewDemoOperation.Type;

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
  if (process.argv.includes("--update-preview")) return "update-preview";
  if (process.argv.includes("--update")) return "update";
  if (process.argv.includes("--uninstall")) return "uninstall";
  return undefined;
};

const decodeSetupOperation = (input: string) =>
  decodeJson(input).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(SetupOperation, { onExcessProperty: "error" })),
  );

const decodeFirstReviewDemoOperation = (input: string) =>
  decodeJson(input).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(FirstReviewDemoOperation, { onExcessProperty: "error" })),
  );

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
const isClaudeHook = process.argv.includes("--claude-hook");
const isOpenCodeHook = process.argv.includes("--opencode-hook");
const directHookStartedAt = performance.now();
const directHookDeadline = directHookStartedAt + 3_900;
const directHookWatchdog = isClaudeHook || isOpenCodeHook
  ? setTimeout(() => process.exit(0), 4_500)
  : undefined;
let keepDirectHookWatchdog = false;

type ClaudeOutputWriteResult = "written" | "error" | "timed-out";

const writeClaudeOutputWithinHookBudget = (encoded: string): Promise<ClaudeOutputWriteResult> => {
  const remaining = directHookDeadline - performance.now();
  if (remaining <= 0) return Promise.resolve("timed-out");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ClaudeOutputWriteResult, keepErrorListener = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!keepErrorListener) process.stdout.removeListener("error", onError);
      resolve(result);
    };
    const onError = () => finish("error");
    const timer = setTimeout(() => finish("timed-out", true), remaining);
    process.stdout.once("error", onError);
    try {
      process.stdout.write(encoded, (error?: Error | null) => {
        finish(error === undefined || error === null ? "written" : "error", error !== undefined && error !== null);
      });
    } catch {
      finish("error", true);
    }
  });
};
const hookVersionArgument = process.argv.find((argument) => argument.startsWith("--codex-version="));
const requestedHookVersion = hookVersionArgument?.slice("--codex-version=".length);
if (isCodexHook && requestedHookVersion !== undefined && !isCodexHostVersion(requestedHookVersion)) {
  throw new Error("unsupported Codex hook version");
}
const codexHookVersion: CodexHostVersion = isCodexHostVersion(requestedHookVersion) ? requestedHookVersion : "0.155.1";
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
  hostVersion: CodexHostVersion,
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
    const reply = yield* adaptCodexReply(nativeEvent, hostVersion);
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
    const observation = yield* adaptCodexDirectEvent(nativeEvent, hostVersion);
    if (observation !== undefined) {
      recordDemoTrace(process.env.REVIEW_DEMO_BUDGET_PATH, observation.root, observation.recipient, { kind: "edit" });
    }
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

const runDirectBoundedHook = async (
  observation: DirectObservation | undefined,
  controlled: ControlledDecisionModelOptions | undefined,
  statePath: string,
  activityPath: string,
  userConfigPath: string | undefined,
): Promise<unknown> => {
  const deadline = directHookDeadline;
  if (observation === undefined) return {};
  const remaining = () => Math.max(0, deadline - performance.now());
  const bounded = async <A>(task: () => Promise<A>): Promise<A | undefined> => {
    const time = remaining();
    if (time <= 0) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task(),
        new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), time); }),
      ]);
    } catch { return undefined; }
    finally { if (timer !== undefined) clearTimeout(timer); }
  };
  const dispatch = await bounded(() => makeResidentDispatchContext(
    observation.root, statePath, activityPath, userConfigPath, controlled,
  ));
  if (dispatch === undefined) return {};
  if (isClaudeHook) {
    const accepted = await bounded(() => admitTicketedObservation(observation, dispatch));
    if (accepted?.status !== "accepted") return {};
    while (remaining() > 150) {
      const outcome = await bounded(() => collectOutcome(accepted.admission));
      if (outcome === undefined) return {};
      if (outcome.status === "advice") {
        return { _tag: "DirectEventReady", value: outcome.advice.output, collected: outcome.advice };
      }
      if (outcome.status !== "pending") return {};
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, remaining())));
    }
    return {};
  }
  const accepted = await bounded(() => admitObservation(observation, true, dispatch));
  if (accepted?.status !== "accepted") return {};
  while (remaining() > 150) {
    const collected = await bounded(() => collectReady(
      observation.root, observation.recipient, dispatch,
    ));
    if (collected !== undefined) return { _tag: "DirectEventReady", value: collected.output, collected };
    await new Promise((resolve) => setTimeout(resolve, Math.min(50, remaining())));
  }
  return {};
};

const isDirectEventReady = (
  value: unknown,
): value is {
  readonly _tag: "DirectEventReady";
  readonly value: ClaudeHostOutput;
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
              : `saved review credential is ${credential?.status ?? "unavailable"}; run hapsland --login`,
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
  const inputRequestsInstallation = /"operation"\s*:\s*"(?:doctor|install-preview|install|update-preview|update|uninstall)"/.test(input);
  const inputRequestsSetup = /"operation"\s*:\s*"setup"/.test(input);
  const inputRequestsFirstReviewDemo = /"operation"\s*:\s*"demo"/.test(input);
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
  if (process.argv.includes("--setup") || inputRequestsSetup) {
    const operation: SetupOperation = yield* decodeSetupOperation(input);
    return yield* runSetup(operation, {
      statePath,
      ...(userConfigPath === undefined ? {} : { userConfigPath }),
      ...(operation.interactive === true ? { readCredential: readMaskedCredential } : {}),
    }).pipe(Effect.provide(Consent.layer({ statePath })));
  }
  if (process.argv.includes("--demo") || inputRequestsFirstReviewDemo) {
    const operation: FirstReviewDemoOperation = yield* decodeFirstReviewDemoOperation(input);
    const demoStatePath = process.env.REVIEW_DEMO_STATE_PATH ??
      join(homedir(), ".local", "state", "realtime-review-tool", "demos");
    return yield* runFirstReviewDemo(operation, { statePath: demoStatePath }).pipe(
      Effect.provide(Consent.layer({ statePath })),
    );
  }
  if (requestedInstallationOperation !== undefined || inputRequestsInstallation) {
    const operation = yield* decodeInstallationOperation(input, requestedInstallationOperation);
    if (operation.host === "claude") {
      const claudeRequest = {
        ...(operation.claudeHome === undefined ? {} : { claudeHome: operation.claudeHome }),
        ...(!("claudeExecutable" in operation) || operation.claudeExecutable === undefined
          ? {} : { claudeExecutable: operation.claudeExecutable }),
        ...(!("proposalDigest" in operation) || operation.proposalDigest === undefined
          ? {} : { proposalDigest: operation.proposalDigest }),
      };
      switch (operation.operation) {
        case "doctor": return diagnoseClaudeIntegration(claudeRequest);
        case "install-preview": return previewClaudeInstallation(claudeRequest);
        case "install": return yield* Effect.promise(() => installClaudeIntegration(claudeRequest));
        case "update-preview": return previewClaudeUpdate(claudeRequest);
        case "update": return yield* Effect.promise(() => updateClaudeIntegration(claudeRequest));
        case "uninstall": return yield* Effect.promise(() => uninstallClaudeIntegration(claudeRequest));
      }
    }
    if (operation.host === "opencode") {
      const opencodeRequest = {
        ...(operation.opencodeConfigHome === undefined ? {} : { opencodeConfigHome: operation.opencodeConfigHome }),
        ...(!("opencodeExecutable" in operation) || operation.opencodeExecutable === undefined
          ? {} : { opencodeExecutable: operation.opencodeExecutable }),
        ...(!("proposalDigest" in operation) || operation.proposalDigest === undefined
          ? {} : { proposalDigest: operation.proposalDigest }),
      };
      switch (operation.operation) {
        case "doctor": return diagnoseOpenCodeIntegration(opencodeRequest);
        case "install-preview": return previewOpenCodeInstallation(opencodeRequest);
        case "install": return yield* Effect.promise(() => installOpenCodeIntegration(opencodeRequest));
        case "update-preview": return previewOpenCodeUpdate(opencodeRequest);
        case "update": return yield* Effect.promise(() => updateOpenCodeIntegration(opencodeRequest));
        case "uninstall": return yield* Effect.promise(() => uninstallOpenCodeIntegration(opencodeRequest));
      }
    }
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
          const doctorEnvironmentCredential = yield* Config.option(Config.String(settings.credentialEnvVar)).pipe(
            Effect.map((value) => Option.isSome(value) && value.value.length > 0),
          );
          const credential = yield* Effect.promise(() => resolveCredential({
            envVar: settings.credentialEnvVar,
            environmentOnly:
              settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in",
          }));
          const credentialReady = credential.status === "present";
          const credentialAction = credentialReady
            ? undefined
            : credential.source === "environment"
              ? `make ${settings.credentialEnvVar} available to the installed hook environment, then rerun doctor`
              : credential.status === "locked" || credential.status === "interaction-required"
                ? "run hapsland --login in a user terminal and unlock or approve native credential access; background hooks never prompt"
                : credential.status === "timed-out"
                  ? "repair or unlock the native credential store; its noninteractive lookup exceeded the 750 ms deadline"
                  : credential.status === "suspended"
                    ? "reconcile the suspended credential with hapsland --login or hapsland --logout before review"
                    : credential.status === "unavailable"
                      ? "reinstall an archive containing the native helper for this platform if it is missing, or restore native credential access; then rerun doctor"
                      : "store a credential with hapsland --login, then rerun doctor";
          const credentialStatus = credentialReady
            ? "ready" as const
            : credential.status === "invalid" || credential.status === "suspended"
              ? "conflict" as const
              : "missing" as const;
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
              status: credentialStatus,
              observed: {
                inspectedContext: "doctor-process",
                configuredEnvironmentVariable: settings.credentialEnvVar,
                doctorProcessEnvironment: doctorEnvironmentCredential ? "present" : "absent",
                actualHookAccessibility: credential.source === "saved" && credentialReady
                  ? "available-via-noninteractive-native-lookup"
                  : credential.source === "environment" && credentialReady
                    ? "requires-host-environment-verification"
                    : "unavailable",
                savedCredentialAccessibility: credential.source === "saved"
                  ? credential.status
                  : "not-selected-environment-precedence",
                selectedSource: credential.source,
              },
              ...(credentialAction === undefined ? {} : { action: credentialAction }),
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
      case "update-preview":
        return previewCodexUpdate(request);
      case "update":
        return yield* Effect.promise(() => updateCodexIntegration(request));
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

  if (isClaudeHook || isOpenCodeHook) {
    const nativeEvent = yield* decodeJson(input);
    const observation = isClaudeHook
      ? yield* adaptClaudeDirectEvent(nativeEvent)
      : yield* adaptOpenCodeDirectEvent(nativeEvent);
    return yield* Effect.tryPromise(() => runDirectBoundedHook(
      observation, controlled, statePath, activityPath, userConfigPath,
    )).pipe(Effect.catch(() => Effect.succeed({})));
  }

  if (isCodexHook) {
    const nativeEvent = yield* decodeJson(input);
    const direct = yield* runDirectCodexHook(
      nativeEvent,
      codexHookVersion,
      controlled,
      statePath,
      activityPath,
      userConfigPath,
    );
    if (direct.handled) return direct.output;
    // The legacy whole-file adapter is evidenced only on the earlier host.
    // A new native event shape on 0.156.0 must stay quiet until attributed.
    if (codexHookVersion !== "0.155.1") return {};
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
      isClaudeHook || isOpenCodeHook ? {} : isCodexHook
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
  const original = spawnSync("stty", terminalModeArguments(process.platform, "-g"), {
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
      spawnSync("stty", terminalModeArguments(process.platform, originalMode), { stdio: "ignore" });
      const observed = spawnSync("stty", terminalModeArguments(process.platform, "-g"), {
        encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      });
      if (observed.status === 0 && observed.stdout.trim() === originalMode) {
        restored = true;
        return;
      }
    }
  };
  const disabled = spawnSync("stty", terminalModeArguments(process.platform, "-echo"), { stdio: "ignore" });
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
    const probe = await runSecretService("probe", { deadlineMs: 2_000, allowInteraction: true });
    if (probe.status !== "available") {
      return {
        version: 1,
        operation: "login",
        status: probe.status,
        action: probe.status === "locked"
          ? "unlock the native credential store in the desktop session, then retry"
          : probe.status === "interaction-required"
            ? "approve native credential access from this explicit login command, then retry"
            : "reinstall an archive containing the native helper for this platform if it is missing, or make the native credential store available; then retry",
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
      stateLock: result.stateLock,
      ...(result.status === "indeterminate"
        ? { action: "credential replacement may have committed; retry login or logout before review" }
        : result.status === "busy"
          ? { action: "another credential change is still running; retry" }
          : {}),
      generation: result.state.generation,
    };
  }
  const result = await logoutCredential();
  let environmentName: string = DEFAULT_CREDENTIAL_ENV_VAR;
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
    status: result.status === "busy" || result.status === "indeterminate"
      ? result.status
      : result.status === "deleted" || result.status === "missing"
      ? "logged-out"
      : "deletion-failed",
    stateLock: result.stateLock,
    savedCredentialUse: result.state.savedUseSuspended ? "suspended" : "absent",
    generation: result.state.generation,
    grantsPreserved: true,
    sentRequestsRecalled: false,
    ...(result.status === "busy"
      ? { action: "another credential change is still running; retry" }
      : result.status === "indeterminate"
        ? { action: "saved credential deletion may have committed; retry logout to reconcile suspended saved use" }
        : {}),
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
const printHelp = () => {
  process.stdout.write(`Hapsland — Codex review integration

  hapsland --pilot            Guided opt-in setup in a terminal
  hapsland --login            Save a Jev key with masked entry
  hapsland --doctor           Offline readiness check (JSON request on stdin)
  hapsland --disable          Revoke repository review (JSON request on stdin)
  hapsland --logout           Remove the saved Jev key

Hapsland uses Jev as its external review backend. Installation
does not permit sending source. --pilot asks separately before enabling a repository.
For automation, use the versioned --setup operation documented in docs/codex-installation.md.
`);
};

const flagValue = (name: string): string | undefined =>
  process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);

const pilotSetup = async () => {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    process.stderr.write("Guided setup needs a terminal. Run hapsland --pilot there, or use hapsland --setup with a versioned JSON request.\n");
    process.exitCode = 6;
    return;
  }
  const ask = async (question: string) => {
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try { return (await prompt.question(`${question} [y/N] `)).trim().toLowerCase() === "y"; }
    finally { prompt.close(); }
  };
  const statePath = process.env.REVIEW_STATE_PATH ?? process.env.REVIEW_CONSENT_FILE ??
    join(homedir(), ".config", "realtime-review-tool", "consent");
  const cwd = process.cwd();
  let request: SetupOperation = {
    version: 1,
    operation: "setup",
    host: "codex",
    scope: { cwd, review: "enabled" },
    credential: "saved",
    ...(flagValue("--codex-home") === undefined ? {} : { codexHome: flagValue("--codex-home")! }),
    ...(flagValue("--codex-executable") === undefined ? {} : { codexExecutable: flagValue("--codex-executable")! }),
  };
  let credentialEntered = false;
  const run = (step: SetupOperation) => Effect.runPromise(runSetup(step, {
    statePath,
    readCredential: async () => {
      const value = await readMaskedCredential();
      credentialEntered = true;
      return value;
    },
  }).pipe(Effect.provide(Consent.layer({ statePath }))));
  const stage = (result: Awaited<ReturnType<typeof run>>, name: string) =>
    result.stages.find((item) => item.stage === name);
  const action = (result: Awaited<ReturnType<typeof run>>, code: string) =>
    result.actions.find((item) => item.code === code);
    process.stderr.write("Codex review integration pilot — current repository only. No Jev call is made during setup.\n");
    let result = await run(request);
    process.stderr.write(`Compatibility: ${stage(result, "compatibility")?.summary ?? "unavailable"}.\n`);
    if (stage(result, "compatibility")?.status !== "complete") {
      process.stderr.write(`${result.actions[0]?.action ?? "Use a declared Codex profile."}\n`);
      process.exitCode = 3;
      return;
    }
    if (!["complete", "pending"].includes(stage(result, "installation")?.status ?? "")) {
      process.stderr.write(`Installation: ${stage(result, "installation")?.summary ?? "unavailable"}.\n`);
      for (const item of result.actions) process.stderr.write(`Next: ${item.action}.\n`);
      process.exitCode = result.status === "partial" ? 5 : 4;
      return;
    }
    const install = action(result, "approve-installation");
    if (install !== undefined) {
      const observed = stage(result, "installation")?.observed as { proposal?: { ownedChanges?: unknown } } | undefined;
      process.stderr.write(`Installation preview (owned changes):\n${JSON.stringify(observed?.proposal?.ownedChanges, null, 2)}\n`);
      if (!await ask("Install these entries in the selected Codex profile?")) {
        process.stderr.write("Installation was not changed. Run hapsland --pilot to resume.\n");
        return;
      }
      const digest = install.authorization?.installProposalDigest;
      if (digest === undefined) throw new Error("installation preview omitted its approval digest");
      request = { ...request, installProposalDigest: digest };
    }
    result = await run({ ...request, interactive: true });
    process.stderr.write(`Installation: ${stage(result, "installation")?.summary ?? "unavailable"}.\n`);
    if (credentialEntered && stage(result, "credential")?.status === "complete") {
      process.stderr.write(`Jev key saved in ${process.platform === "darwin" ? "Keychain" : "Secret Service"}.\n`);
    }
    process.stderr.write(`Credential: ${stage(result, "credential")?.summary ?? "unavailable"}. No paid verification or review was sent.\n`);
    if (stage(result, "installation")?.status !== "complete" || stage(result, "credential")?.status !== "complete") {
      for (const item of result.actions) process.stderr.write(`Next: ${item.action}.\n`);
      process.exitCode = result.status === "partial" ? 5 : 6;
      return;
    }
    const consent = action(result, "approve-repository-consent");
    if (consent !== undefined) {
      process.stderr.write(`Repository enablement preview: ${JSON.stringify(stage(result, "repository")?.observed, null, 2)}\n`);
      process.stderr.write("Enabling permits eligible source from this canonical repository to be sent to Jev.\n");
      if (!await ask("Enable review for this repository and destination?")) {
        process.stderr.write("Repository review remains disabled. Run hapsland --pilot to resume.\n");
        return;
      }
      const digest = consent.authorization?.consentProposalDigest;
      if (digest === undefined) throw new Error("repository preview omitted its approval digest");
      request = { ...request, consentProposalDigest: digest };
      result = await run(request);
    }
    process.stderr.write(`Repository: ${stage(result, "repository")?.summary ?? "unavailable"}.\n`);
    if (stage(result, "repository")?.status !== "complete") {
      for (const item of result.actions) process.stderr.write(`Next: ${item.action}.\n`);
      process.exitCode = 6;
      return;
    }
    const doctor = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--doctor"], {
      cwd,
      input: JSON.stringify({ version: 1, operation: "doctor", cwd,
        ...(request.codexHome === undefined ? {} : { codexHome: request.codexHome }),
        ...(request.codexExecutable === undefined ? {} : { codexExecutable: request.codexExecutable }) }),
      encoding: "utf8",
      timeout: 10_000,
    });
    if (doctor.status !== 0) {
      process.stderr.write("Readiness check could not complete. Run hapsland --pilot again or inspect hapsland --doctor.\n");
      process.exitCode = 6;
      return;
    }
    let diagnosis: { status: string; nextSteps: Array<{ action: string }> };
    try { diagnosis = JSON.parse(doctor.stdout) as typeof diagnosis; }
    catch {
      process.stderr.write("Readiness result was unreadable. Rerun hapsland --pilot or inspect hapsland --doctor.\n");
      process.exitCode = 6;
      return;
    }
    process.stderr.write(`Offline readiness: ${diagnosis.status}.\n`);
    for (const next of diagnosis.nextSteps) process.stderr.write(`Next: ${next.action}.\n`);
    process.stderr.write("After native Codex repository and hook trust, make an ordinary supported edit and inspect review activity.\n");
};

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
} else if (process.argv.includes("--pilot")) {
  await pilotSetup();
} else {
const output = isCredentialCommand
  ? await runCredentialCommand()
  : await Effect.runPromise(program);
if (!isCodexHook && !isClaudeHook && !isOpenCodeHook && typeof output === "object" && output !== null) {
  const record = output as Readonly<Record<string, unknown>>;
  process.exitCode = record.status === "unsupported"
    ? 3
    : record.status === "conflict" || record.status === "proposal-mismatch"
      ? 4
      : record.status === "partial"
        ? 5
        : record.status === "deletion-failed" ||
            record.status === "needs-user-action" ||
            record.status === "locked" ||
            record.status === "interaction-required" ||
            record.status === "unavailable" ||
            record.status === "timed-out" ||
            record.status === "indeterminate" ||
            record.status === "busy" ||
            record.status === "cancelled" ||
            record.status === "invalid" ||
            record.status === "incomplete" ||
            record.status === "inconclusive"
          ? 6
        : "error" in record
          ? 2
          : 0;
}
if (isDirectEventReady(output)) {
  const hostWriteResult = isClaudeHook
    ? await writeClaudeOutputWithinHookBudget(encodeClaudeHostOutputLine(output.value))
    : "written";
  if (hostWriteResult === "timed-out") keepDirectHookWatchdog = true;
  if (!isClaudeHook || hostWriteResult === "written") {
    if (!isClaudeHook && isOpenCodeHook) {
      if ("hookSpecificOutput" in output.value) {
        process.stdout.write(output.value.hookSpecificOutput.additionalContext);
      }
    } else if (!isClaudeHook && "hookSpecificOutput" in output.value) attemptCodexHostOutput(output.value, (encoded) => {
      process.stdout.write(encoded);
    });
    recordDemoTrace(process.env.REVIEW_DEMO_BUDGET_PATH, output.collected.root, output.collected.recipient, {
      kind: "delivery",
      ruleIds: [...claudeHostOutputText(output.value).matchAll(/\[([a-z0-9_/-]+), p=/g)].map((match) => match[1] ?? ""),
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
  }
} else {
  if (isOpenCodeHook) {
    // The plugin treats empty stdout as a quiet skip.
  } else
  if (isCredentialCommand && !process.argv.includes("--json") && !process.argv.includes("--credential-stdin") && process.stdin.isTTY) {
    const result = output as Readonly<Record<string, unknown>>;
    if (result.operation === "login" && result.status === "stored") {
      process.stdout.write(`Jev key saved in ${process.platform === "darwin" ? "Keychain" : "Secret Service"}. No Jev request or review was sent.\nNext: complete Codex sign-in and native trust, then run hapsland --pilot or the offline doctor.\n`);
    } else {
      const next = result.action ?? (result.operation === "logout"
        ? "Repository grants remain; disable review separately if needed."
        : result.status === "invalid"
          ? "Enter a nonempty Jev key and retry hapsland --login. The previous saved key was preserved."
          : result.status === "cancelled"
            ? "No key was changed. Run hapsland --login again when ready."
            : result.status === "locked" || result.status === "interaction-required"
              ? "Unlock or approve the native credential store in this session, then retry hapsland --login."
              : "Check native credential storage in this user session, then retry hapsland --login.");
      process.stdout.write(`${result.operation === "logout" ? "Logout" : "Login"}: ${String(result.status)}. ${String(next)}\n`);
      if (result.operation === "logout") {
        const environment = result.environmentOverride as { envVar?: string; active?: boolean } | undefined;
        if (environment?.active === true) process.stdout.write(`${environment.envVar ?? "The selected environment credential"} remains active; disable repository review to stop dispatch.\n`);
      }
    }
  } else {
    process.stdout.write(typeof output === "string" ? output : `${JSON.stringify(output)}\n`);
  }
}
if (directHookWatchdog !== undefined && !keepDirectHookWatchdog) clearTimeout(directHookWatchdog);
}
