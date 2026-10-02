#!/usr/bin/env node
import { isHookInvocation, parseInvocation, type ClientArguments } from "./cli-command.ts";
import { hookMonotonicMillis, monotonicNow } from "./resident/hook-clock.ts";
import { readMaskedCredential } from "./credentials/masked-input.ts";
import * as Schedule from "effect/Schedule";
import { effectiveSessionAnalytics } from "./configuration/resolve.ts";
import { readAnalytics, formatAnalyticsHuman } from "./activity/analytics.ts";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { execFileClosedStdin } from "./onboarding/host-process.ts";
import { askConfirmation } from "./onboarding/confirmation.ts";
import { fileURLToPath } from "node:url";
import { discoverWorkingTreeRoot, rootRelativePath } from "./repository/root.ts";
import { selectFile } from "./configuration/decision.ts";
import {
  DEFAULT_CREDENTIAL_ENV_VAR,
  loadReviewSettings,
  type ReviewSettings,
} from "./runtime/review-config.ts";
import { explainPath, formatPathExplanation } from "./explanation/index.ts";
import type { ControlledDecisionModelOptions } from "./test-support/controlled-decision-model.ts";
import { runEvaluationCommand } from "./evaluation/command.ts";
import {
  adaptCodexDirectEvent,
  adaptCodexReply,
  adaptClaudeDirectEvent,
  isCodexNativeApplyPatch,
} from "./direct-event/adapter.ts";
import { isCodexHostVersion, type CodexHostVersion } from "./direct-event/model.ts";
import type { DirectObservation } from "./direct-event/model.ts";
import {
  type ClaudeHostOutput,
} from "./direct-event/claude-output.ts";
import { directHookSubmissionLayer, submitDirectHookOutput } from "./resident/direct-hook-output.ts";
import {
  admitObservationEffect,
  admitAndCollectEffect,
  ensureResidentEffect,
  ResidentStartup,
  residentStartupLayer,
  inspectResidentEffect,
  makeResidentDispatchContextEffect,
  type CollectedAdvice,
} from "./resident/client.ts";
import { HookOutput, hookOutputLayer } from "./resident/hook-output.ts";
import { composedHookRuntimeLayer, runComposedHookEffect, type ComposedHookKind, type ComposedHookHost } from "./resident/composed-hook.ts";
import {
  installCodexIntegration,
  inspectCodexInstallation,
  hasCodexRegistration,
  previewCodexInstallation,
  previewCodexUpdate,
  uninstallCodexIntegration,
  updateCodexIntegration,
} from "./onboarding/codex-installation.ts";
import {
  previewClaudeInstallation, inspectClaudeInstallation, hasClaudeRegistration, installClaudeIntegration, previewClaudeUpdate,
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
import { readActivity, formatActivityHuman, recordActivity } from "./activity/status.ts";
import { diagnoseInstalledIntegration, type DoctorCheck } from "./onboarding/doctor.ts";
import { selectSetupClients, type ClientChoice, type SetupClient } from "./onboarding/client-selection.ts";
import { stageRelease, type ReleaseSelection } from "./onboarding/distribution.ts";
import { activateCurrentPackage, activatePackage, dispatchActivePackage, dispatchSelectedPackage, formatCompatibility, formatDoctor, formatFailure, formatProposal, invokeLifecycle, profileFields, registeredClients } from "./onboarding/client-lifecycle.ts";
import { runSetup } from "./onboarding/setup.ts";
import { runFirstReviewDemo } from "./onboarding/first-review-demo.ts";
import { recordDemoTrace } from "./onboarding/demo-trace.ts";

const directHookStartedAt = monotonicNow();
let invocation: Awaited<ReturnType<typeof parseInvocation>>;
try { invocation = await parseInvocation(process.argv.slice(2)); }
catch (cause) {
  // Invalid native hook invocations must never emit generic CLI output.
  if (isHookInvocation(process.argv.slice(2))) process.exit(0);
  process.stderr.write(`${(cause instanceof Error ? cause.message : "Invalid CLI arguments").slice(0, 1400)}\n`);
  process.exit(6);
}
if (invocation === undefined) process.exit(0);
const cliOptions = invocation.kind === "automation" ? invocation.options : undefined;
const cliSwitch = (name: string): boolean => cliOptions !== undefined && name in cliOptions && cliOptions[name as keyof typeof cliOptions] === true;

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
  failureOnSourceIncludes: Schema.optionalKey(Schema.String),
  findingOnSourceIncludes: Schema.optionalKey(Schema.String),
  capturePath: Schema.optionalKey(Schema.String),
  requestSummaryPath: Schema.optionalKey(Schema.String),
  outcomePath: Schema.optionalKey(Schema.String),
  requireCredential: Schema.optionalKey(Schema.Boolean),
  syntheticR6BrandedRepair: Schema.optionalKey(Schema.Literals(["control", "finding"])),
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

const ReviewOperation = Schema.Union([
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
type ReviewOperation = typeof ReviewOperation.Type;

const installationOperationsFor = <const Fields extends Schema.Struct.Fields>(fields: Fields) => Schema.Union([
  Schema.Struct({ version: Schema.Literal(1), operation: Schema.Literal("doctor"), cwd: Schema.String, ...fields }),
  Schema.Struct({ version: Schema.Literal(1), operation: Schema.Literal("install-preview"), reinstall: Schema.optionalKey(Schema.Boolean), ...fields }),
  Schema.Struct({
    version: Schema.Literal(1), operation: Schema.Literal("install"), reinstall: Schema.optionalKey(Schema.Boolean), ...fields,
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

const setupOperationsFor = <const Fields extends Schema.Struct.Fields>(fields: Fields) => Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literal("setup"),
  scope: Schema.Struct({ cwd: Schema.NonEmptyString, review: Schema.Literals(["enabled", "disabled"]) }),
  credential: Schema.Literals(["saved", "environment", "skip"]),
  installProposalDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
  interactive: Schema.optionalKey(Schema.Boolean),
  ...fields,
});
const SetupOperation = Schema.Union([
  setupOperationsFor({ host: Schema.Literal("codex"), codexHome: Schema.optionalKey(Schema.NonEmptyString), codexExecutable: Schema.optionalKey(Schema.NonEmptyString) }),
  setupOperationsFor({ host: Schema.Literal("claude"), claudeHome: Schema.optionalKey(Schema.NonEmptyString), claudeExecutable: Schema.optionalKey(Schema.NonEmptyString) }),
]);
type SetupOperation = typeof SetupOperation.Type;

const FirstReviewDemoOperation = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literal("demo"),
  selection: Schema.Literals(["preview", "live", "cancel"]),
  codexHome: Schema.optionalKey(Schema.NonEmptyString),
  codexExecutable: Schema.optionalKey(Schema.NonEmptyString),
  demoId: Schema.optionalKey(Schema.NonEmptyString),
  selectionDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
});
type FirstReviewDemoOperation = typeof FirstReviewDemoOperation.Type;

const statePathConfig = Config.option(Config.NonEmptyString("REVIEW_STATE_PATH")).pipe(
  Config.flatMap(Option.match({
    onSome: Config.succeed,
    onNone: () => Config.NonEmptyString("REVIEW_CONSENT_FILE").pipe(
      Config.withDefault(join(homedir(), ".config", "realtime-review-tool", "consent")),
    ),
  })),
);

const activityPathConfig = Config.NonEmptyString("REVIEW_ACTIVITY_PATH").pipe(
  Config.withDefault(join(homedir(), ".local", "state", "realtime-review-tool", "activity")),
);

const userConfigPathConfig = Config.option(Config.NonEmptyString("REVIEW_USER_CONFIG_PATH"));

const forcedOperation = (): ReviewOperation["operation"] | undefined => {
  if (cliSwitch("credentials")) {
    return "credentials";
  }
  if (cliSwitch("status")) {
    return "status";
  }
  if (cliSwitch("explain")) {
    return "explain";
  }
  return undefined;
};

const forcedInstallationOperation = (): InstallationOperation["operation"] | undefined => {
  if (cliSwitch("doctor")) return "doctor";
  if (cliSwitch("install-preview")) return "install-preview";
  if (cliSwitch("install")) return "install";
  if (cliSwitch("update-preview")) return "update-preview";
  if (cliSwitch("update")) return "update";
  if (cliSwitch("uninstall")) return "uninstall";
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
  if (cliSwitch("evaluation-plan")) return "plan";
  if (cliSwitch("evaluation-run")) return "run";
  if (cliSwitch("evaluation-report")) return "report";
  return undefined;
};

const forcedStatusFormat = (): "human" | undefined =>
  cliSwitch("human")
    ? "human"
    : undefined;

const decodeOperation = (input: string, forced: ReviewOperation["operation"] | undefined) =>
  decodeJson(input).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(ReviewOperation, {
        onExcessProperty: "error",
      })(value),
    ),
    Effect.flatMap((operation) =>
      forced !== undefined && operation.operation !== forced
        ? Effect.fail(new Error("operation flag does not match the request"))
        : Effect.succeed(operation),
    ),
  );

const assertNever = (value: never): never => {
  throw new Error(`unsupported consent operation: ${String(value)}`);
};

const fileSelectionReadiness = (settings: ReviewSettings) => {
  const includesEmpty = settings.configuration.policy.includes.length === 0;
  const userExcludeAll = settings.configuration.policy.excludes.some((entry) =>
    entry.origin.layer === "user" && entry.value === "**/*");
  const excludeAll = settings.configuration.policy.excludes.some((entry) => entry.value === "**/*");
  const selected = selectFile({ protected: false, excluded: excludeAll,
    includesEmpty, included: true }) === "selected";
  return {
    selected,
    observed: includesEmpty
      ? "effective include list selects no files"
      : userExcludeAll
        ? "user file settings exclude all files"
        : excludeAll
          ? "effective file settings exclude all files"
        : "effective file settings loaded",
  };
};

const isCodexHook = cliSwitch("codex-hook");
const isClaudeHook = cliSwitch("claude-hook");
const isOpenCodeHook = cliSwitch("opencode-hook");
const isComposedEditHook = cliSwitch("composed-edit-hook");
const composedKind: ComposedHookKind | undefined = cliSwitch("composed-before-edit-hook")
  ? "before-edit" : cliSwitch("composed-background-hook")
  ? "background" : cliSwitch("composed-stop-hook")
    ? "stop" : cliSwitch("composed-prompt-hook") ? "prompt" : undefined;
const composedHost: ComposedHookHost = cliOptions?.["composed-host"] === "claude-code"
  ? "claude-code" : "codex-cli";
const directHookDeadline = directHookStartedAt +
  (isCodexHook && isComposedEditHook ? 9_000 : 3_900);
const requestedHookVersion = cliOptions?.["codex-version"];
if (isCodexHook && (isComposedEditHook || composedKind !== undefined) && requestedHookVersion !== undefined && !isCodexHostVersion(requestedHookVersion)) {
  process.exit(0);
}
const codexHookVersion: CodexHostVersion = isCodexHostVersion(requestedHookVersion) ? requestedHookVersion : "0.155.1";
const isControlledReviewer = cliSwitch("controlled-reviewer");
const isControlledWriter = cliSwitch("controlled-writer");
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
): Effect.Effect<DirectHookDispatch, unknown, ResidentStartup> =>
  Effect.gen(function* () {
    if (!isCodexNativeApplyPatch(nativeEvent)) return { handled: false } as const;
    const reply = yield* adaptCodexReply(nativeEvent, hostVersion);
    const owner = yield* ensureResidentEffect().pipe(Effect.option);
    if (Option.isNone(owner)) {
      if (reply !== undefined) {
        recordActivity({ statePath: activityPath, root: reply.root, advicee: reply.advicee, lifetime: "resident-unavailable", stage: "unavailable" });
      }
      return { handled: true, output: {} } as const;
    }
    const dispatch = reply === undefined
      ? undefined
      : yield* makeResidentDispatchContextEffect(
          reply.root,
          statePath,
          activityPath,
          userConfigPath,
          controlled,
        ).pipe(Effect.catch(() => Effect.succeed(undefined)));
    const observation = yield* adaptCodexDirectEvent(nativeEvent, hostVersion);
    if (observation !== undefined) {
      const demoBudgetPath = yield* Config.option(Config.NonEmptyString("REVIEW_DEMO_BUDGET_PATH"));
      recordDemoTrace(Option.getOrUndefined(demoBudgetPath), observation.root, observation.advicee, { kind: "edit" });
    }
    // The direct dispatcher owns every native apply_patch event. Unsupported
    // shapes remain quiet and can never create review work.
    if (observation === undefined) {
      if (reply !== undefined) {
        recordActivity({ statePath: activityPath, root: reply.root, advicee: reply.advicee, lifetime: owner.value.lifetime, stage: "incomplete" });
      }
      return { handled: true, output: {} } as const;
    }
    // Matching reads are not attribution. The hook command must explicitly be
    // installed with this controlled-writer assertion for the supported Add profile.
    if (dispatch === undefined) {
      recordActivity({ statePath: activityPath, root: observation.root, advicee: observation.advicee, lifetime: owner.value.lifetime, stage: "unavailable" });
    } else if (!isControlledWriter) {
      recordActivity({ statePath: activityPath, root: observation.root, advicee: observation.advicee, lifetime: owner.value.lifetime, stage: "unavailable" });
    } else {
      yield* admitObservationEffect(observation, true, dispatch, undefined, isComposedEditHook).pipe(
        Effect.catch(() => {
          recordActivity({ statePath: activityPath, root: observation.root, advicee: observation.advicee, lifetime: owner.value.lifetime, stage: "unavailable" });
          return Effect.void;
        }),
      );
    }
    return { handled: true, output: {} } as const;
  });

const runDirectBoundedHook = Effect.fn("ClaudeHook.collectBounded")(function* (
  observation: DirectObservation | undefined,
  controlled: ControlledDecisionModelOptions | undefined,
  statePath: string,
  activityPath: string,
  userConfigPath: string | undefined,
): Effect.fn.Return<unknown, never, ResidentStartup> {
  const deadline = directHookDeadline;
  if (observation === undefined) return {};
  const bounded = <A, E, R>(task: Effect.Effect<A, E, R>): Effect.Effect<A | undefined, never, R> =>
    Effect.gen(function* () {
      const time = Math.max(0, deadline - (yield* hookMonotonicMillis));
      if (time <= 0) return undefined;
      return yield* task.pipe(
        Effect.timeoutOrElse({ duration: time, orElse: () => Effect.succeed(undefined) }),
        Effect.catch(() => Effect.succeed(undefined)),
      );
    });
  const dispatch = yield* bounded(makeResidentDispatchContextEffect(
    observation.root, statePath, activityPath, userConfigPath, controlled,
  ));
  if (dispatch === undefined) return {};
  const outcome = yield* bounded(admitAndCollectEffect(observation, dispatch, deadline - 150));
  return outcome?.status === "advice"
    ? { _tag: "DirectEventReady", value: outcome.advice.output, collected: outcome.advice }
    : {};
});

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
  operation: ReviewOperation,
  statePath: string,
  activityPath: string,
  userConfigPath: string | undefined,
) =>
  Effect.gen(function* () {
    const cwd = operation.cwd;
    const root = yield* discoverWorkingTreeRoot(cwd);
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
      const credentialEnvVar = settings?.credentialEnvVar ?? DEFAULT_CREDENTIAL_ENV_VAR;
      const credentialResolution = yield* resolveCredential({
        envVar: credentialEnvVar,
        environmentOnly: settings !== undefined &&
          settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in",
      });
      const credentials = credentialResolution.status === "present";
      const configurationStatus = settings === undefined ? "invalid" : "ready";
      const selectionOff = settings !== undefined && !fileSelectionReadiness(settings).selected;
      const readinessStatus =
        configurationStatus === "ready" &&
        credentials && !selectionOff
          ? "ready"
          : "not-ready";
      const resident = yield* inspectResidentEffect();
      const residentActivity = readActivity({
        statePath: activityPath,
        root,
        sessionId: operation.sessionId ?? "",
        resident,
      });
      const analytics = readAnalytics({
        enabled: settings !== undefined && effectiveSessionAnalytics(settings.configuration.policy),
        statePath: activityPath, root, sessionId: operation.sessionId ?? "",
      });
      const output = {
        version: 1,
        operation: "status",
        repository: { canonicalRoot: root },
        ...(operation.sessionId === undefined ? {} : { sessionId: operation.sessionId }),
        readiness: {
          status: readinessStatus,
          configuration: configurationStatus,
          fileSelection: settings === undefined ? "unavailable" :
            selectionOff ? "none" : "configured",
          credentials: {
            envVar: credentialEnvVar,
            present: credentials,
            source: credentialResolution.source,
            status: credentialResolution.status,
          },
        },
        activity: residentActivity,
        analytics,
        activitySource: "resident-v1",
      };
      return operation.format === "human"
        ? `readiness: ${readinessStatus} (configuration=${configurationStatus}, files=${output.readiness.fileSelection}, credentials=${credentials ? "present" : "absent"})\n${formatActivityHuman(operation.sessionId ?? "<session id required>", residentActivity)}\n${formatAnalyticsHuman(analytics)}`
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
      case "credentials": {
        const resolution = yield* resolveCredential({
          envVar: credentialEnvVar,
          environmentOnly:
            settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in",
        });
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
  });

const program = Effect.gen(function* () {
  // Retired entry points cannot decode events, start a resident, or dispatch work.
  if (isOpenCodeHook || (isCodexHook && !isComposedEditHook && composedKind === undefined)) return {};
  const input = yield* readStdin;
  const statePath = yield* statePathConfig;
  const activityPath = yield* activityPathConfig;
  const userConfigPathOption = yield* userConfigPathConfig;
  const userConfigPath = Option.isSome(userConfigPathOption)
    ? userConfigPathOption.value
    : undefined;

  if (composedKind !== undefined) {
    let event: unknown;
    try { event = JSON.parse(input); } catch { event = undefined; }
    const controlled = isControlledReviewer ? yield* controlledOptions : undefined;
    yield* runComposedHookEffect({
      kind: composedKind,
      host: composedHost,
      event,
      codexVersion: codexHookVersion,
      statePath,
      activityPath,
      ...(userConfigPath === undefined ? {} : { userConfigPath }),
      ...(controlled === undefined ? {} : { controlled }),
    });
    return undefined;
  }

  const inputRequestsOperation = /"operation"\s*:\s*"(?:credentials|status|explain)"/.test(
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
      allowLive: cliSwitch("evaluation-live"),
      credentialEnvVar: yield* Config.NonEmptyString("EVALUATION_CREDENTIAL_ENV").pipe(Config.withDefault("TYPESAFE_API_KEY")),
      ...(isControlledReviewer ? { controlled: yield* controlledOptions } : {}),
    });
  }
  if (cliSwitch("setup") || inputRequestsSetup) {
    const operation: SetupOperation = yield* decodeSetupOperation(input);
    return yield* runSetup(operation, {
      statePath,
      ...(userConfigPath === undefined ? {} : { userConfigPath }),
      ...(operation.interactive === true ? { readCredential: readMaskedCredential } : {}),
    });
  }
  if (cliSwitch("demo") || inputRequestsFirstReviewDemo) {
    const operation: FirstReviewDemoOperation = yield* decodeFirstReviewDemoOperation(input);
    const demoStatePath = yield* Config.NonEmptyString("REVIEW_DEMO_STATE_PATH").pipe(
      Config.withDefault(join(homedir(), ".local", "state", "realtime-review-tool", "demos")),
    );
    return yield* runFirstReviewDemo(operation, { statePath: demoStatePath });
  }
  if (requestedInstallationOperation !== undefined || inputRequestsInstallation) {
    const operation = yield* decodeInstallationOperation(input, requestedInstallationOperation);
    if (operation.host === "claude") {
      const claudeRequest = {
        ...("reinstall" in operation && operation.reinstall === true ? { reinstall: true } : {}),
        ...(operation.claudeHome === undefined ? {} : { claudeHome: operation.claudeHome }),
        ...(!("claudeExecutable" in operation) || operation.claudeExecutable === undefined
          ? {} : { claudeExecutable: operation.claudeExecutable }),
        ...(!("proposalDigest" in operation) || operation.proposalDigest === undefined
          ? {} : { proposalDigest: operation.proposalDigest }),
      };
      switch (operation.operation) {
        case "doctor": return yield* diagnoseClaudeIntegration(claudeRequest);
        case "install-preview": return yield* previewClaudeInstallation(claudeRequest);
        case "install": return yield* installClaudeIntegration(claudeRequest);
        case "update-preview": return yield* previewClaudeUpdate(claudeRequest);
        case "update": return yield* updateClaudeIntegration(claudeRequest);
        case "uninstall": return yield* uninstallClaudeIntegration(claudeRequest);
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
        case "doctor": return yield* diagnoseOpenCodeIntegration(opencodeRequest);
        case "install-preview": return previewOpenCodeInstallation(opencodeRequest);
        case "install": return yield* installOpenCodeIntegration(opencodeRequest);
        case "update-preview": return previewOpenCodeUpdate(opencodeRequest);
        case "update": return yield* updateOpenCodeIntegration(opencodeRequest);
        case "uninstall": return yield* uninstallOpenCodeIntegration(opencodeRequest);
      }
    }
    const request = {
      ...("reinstall" in operation && operation.reinstall === true ? { reinstall: true } : {}),
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
          const rootResult = yield* discoverWorkingTreeRoot(operation.cwd).pipe(Effect.result);
          if (rootResult._tag === "Failure") {
            return {
              repository: {
                stage: "file-selection",
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
                stage: "file-selection",
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
          const doctorEnvironmentCredential = yield* Config.option(Config.Redacted(settings.credentialEnvVar)).pipe(
            Effect.map((value) => Option.isSome(value) && Redacted.value(value.value).length > 0),
          );
          const credential = yield* resolveCredential({
            envVar: settings.credentialEnvVar,
            environmentOnly:
              settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in",
          });
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
          const fileSelection = fileSelectionReadiness(settings);
          return {
            repository: {
              stage: "file-selection",
              status: fileSelection.selected ? "ready" : "missing",
              observed: fileSelection.observed,
              ...(!fileSelection.selected ? { action: "adjust user file includes or excludes to select the files you want reviewed" } : {}),
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
        });
        return yield* diagnoseInstalledIntegration({
          installation: request,
          repository: repositoryResult.repository,
          credential: repositoryResult.credential,
        });
      }
      case "install-preview":
        return yield* previewCodexInstallation(request);
      case "install":
        return yield* installCodexIntegration(request);
      case "update-preview":
        return yield* previewCodexUpdate(request);
      case "update":
        return yield* updateCodexIntegration(request);
      case "uninstall":
        return yield* uninstallCodexIntegration(request);
    }
  }
  if (requestedOperation !== undefined || inputRequestsOperation) {
    const decodedOperation = yield* decodeOperation(input, requestedOperation);
    const operation =
      forcedStatusFormat() !== undefined && decodedOperation.operation === "status"
        ? { ...decodedOperation, format: "human" as const }
        : decodedOperation;
    if (operation.operation !== undefined) {
      return yield* runOperation(operation, statePath, activityPath, userConfigPath);
    }
  }

  const controlled = isControlledReviewer ? yield* controlledOptions : undefined;

  if (isClaudeHook) {
    if (!isComposedEditHook) return {};
    const nativeEvent = yield* decodeJson(input);
    const observation = yield* adaptClaudeDirectEvent(nativeEvent, userConfigPath === undefined ? {} : { userConfigPath });
    return yield* runDirectBoundedHook(
      observation, controlled, statePath, activityPath, userConfigPath,
    ).pipe(Effect.catch(() => Effect.succeed({})));
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
    return {};
  }

  return { version: 1, error: { code: "invalid_request", message: "unsupported command" } };
}).pipe(
  Effect.catchCause(() =>
    Effect.succeed(
      composedKind !== undefined ? undefined : isClaudeHook || isOpenCodeHook ? {} : isCodexHook
        ? {
            systemMessage:
              "Review unavailable: invalid or unsupported Codex PostToolUse input.",
          }
        : {
            version: 1,
            error: {
              code: "invalid_request",
              message: "input does not satisfy a supported command contract",
            },
          },
    ),
  ),
);

const runCredentialCommand = Effect.fn("Cli.credentialCommand")(function* () {
  if (cliSwitch("login")) {
    const probe = yield* runSecretService("probe", { deadlineMs: 2_000, allowInteraction: true });
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
    const inputTask: Effect.Effect<string, unknown> = cliSwitch("credential-stdin")
      ? Effect.try(() => readFileSync(0, "utf8").replace(/\r?\n$/, ""))
      : readMaskedCredential();
    const input = yield* inputTask.pipe(Effect.result);
    if (input._tag === "Failure") {
      return {
        version: 1,
        operation: "login",
        status: "cancelled",
        preservedPreviousCredential: true,
        action: "retry in a terminal or explicitly use --credential-stdin",
      };
    }
    let value = input.success;
    const result = yield* saveCredential(value);
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
  const result = yield* logoutCredential();
  let environmentName: string = DEFAULT_CREDENTIAL_ENV_VAR;
  try {
    const repository = yield* execFileClosedStdin("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(), env: process.env, timeout: 1_000, maxBuffer: 1024 * 1024,
    });
    const root = repository.succeeded ? repository.stdout.trim() : "";
    if (root.length > 0) {
      environmentName = yield* loadReviewSettings(root).pipe(
        Effect.map((settings) => settings.credentialEnvVar),
        Effect.catch(() => Effect.succeed(DEFAULT_CREDENTIAL_ENV_VAR)),
      );
    }
  } catch { /* The global default remains the only known environment override. */ }
  const environmentActive = yield* Config.option(Config.Redacted(environmentName)).pipe(
    Effect.map((value) => Option.isSome(value) && Redacted.value(value.value).length > 0),
    Effect.catch(() => Effect.succeed(false)),
  );
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
});

const isCredentialCommand = cliSwitch("login") || cliSwitch("logout");
const processConfigurationLayer = ConfigProvider.layer(ConfigProvider.fromEnv({ preserveEmptyStrings: true }));

let clientArguments: ClientArguments | undefined;
const flagValue = (name: string): string | undefined => clientArguments?.flags.get(name);
const positionalHost = () => clientArguments?.host;
const selectedHost = (): SetupClient => clientArguments?.host ?? "codex";
const hostFields = (host: SetupClient) => profileFields(host, clientArguments?.flags ?? new Map());

const pilotSetup = Effect.fn("InteractiveSetup.run")(function* (host: SetupClient) {
  const hostName = host === "claude" ? "Claude Code" : "Codex";
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    process.stderr.write("Guided setup needs a terminal. Run hapsland --pilot there, or use hapsland --setup with a versioned JSON request.\n");
    process.exitCode = 6;
    return;
  }
  const configuredStatePath = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_STATE_PATH")));
  const statePath = configuredStatePath ?? (yield* Config.NonEmptyString("REVIEW_CONSENT_FILE").pipe(
    Config.withDefault(join(homedir(), ".config", "realtime-review-tool", "consent"))));
  const userConfigPath = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_USER_CONFIG_PATH")));
  const cwd = process.cwd();
  let request: SetupOperation = {
    version: 1,
    operation: "setup",
    ...hostFields(host),
    scope: { cwd, review: "enabled" },
    credential: "saved",
  };
  let credentialEntered = false;
  const run = (step: SetupOperation) => runSetup(step, {
    statePath,
    ...(userConfigPath === undefined ? {} : { userConfigPath }),
    readCredential: () => readMaskedCredential().pipe(Effect.tap(() => Effect.sync(() => { credentialEntered = true; }))),
  });
  const stage = (result: Effect.Success<ReturnType<typeof run>>, name: string) =>
    result.stages.find((item) => item.stage === name);
  const action = (result: Effect.Success<ReturnType<typeof run>>, code: string) =>
    result.actions.find((item) => item.code === code);
    process.stderr.write(`${hostName} review integration setup. Selected profile hooks apply across repositories according to file settings. No Jev call is made during setup.\n`);
    let result = yield* run(request);
    process.stderr.write(`Compatibility: ${stage(result, "compatibility")?.summary ?? "unavailable"}.\n`);
    for (const line of formatCompatibility(stage(result, "compatibility")?.observed)) process.stderr.write(`${line}\n`);
    if (stage(result, "compatibility")?.status !== "complete") {
      process.stderr.write(`${result.actions[0]?.action ?? `Use a declared ${hostName} profile.`}\n`);
      process.exitCode = 3;
      return;
    }
    if (!["complete", "pending", "partial"].includes(stage(result, "installation")?.status ?? "")) {
      process.stderr.write(`Installation: ${stage(result, "installation")?.summary ?? "unavailable"}.\n`);
      for (const item of result.actions) process.stderr.write(`Next: ${item.action}.\n`);
      process.exitCode = result.status === "partial" ? 5 : 4;
      return;
    }
    const install = action(result, "approve-installation") ?? action(result, "resume-installation");
    if (install !== undefined) {
      const observed = stage(result, "installation")?.observed as { proposal?: unknown } | undefined;
      process.stderr.write(`Installation preview:\n${formatProposal(observed?.proposal).join("\n")}\n`);
      if (!(yield* askConfirmation(`Install these entries in the selected ${hostName} profile?`))) {
        process.stderr.write(`Installation was not changed. Run hapsland setup ${host} to resume.\n`);
        return;
      }
      const digest = install.authorization?.installProposalDigest;
      if (digest === undefined) throw new Error("installation preview omitted its approval digest");
      request = { ...request, installProposalDigest: digest };
    }
    result = yield* run({ ...request, interactive: true });
    process.stderr.write(`Installation: ${stage(result, "installation")?.summary ?? "unavailable"}.\n`);
    if (["complete", "partial"].includes(stage(result, "installation")?.status ?? "")) yield* activateCurrentPackage(fileURLToPath(import.meta.url));
    if (credentialEntered && stage(result, "credential")?.status === "complete") {
      process.stderr.write(`Jev key saved in ${process.platform === "darwin" ? "Keychain" : "Secret Service"}.\n`);
    }
    process.stderr.write(`Credential: ${stage(result, "credential")?.summary ?? "unavailable"}. No paid verification or review was sent.\n`);
    if (stage(result, "installation")?.status !== "complete" || stage(result, "credential")?.status !== "complete") {
      for (const item of result.actions) process.stderr.write(`Next: ${item.action}.\n`);
      process.exitCode = result.status === "partial" ? 5 : 6;
      return;
    }
    process.stderr.write(`Repository: ${stage(result, "repository")?.summary ?? "unavailable"}.\n`);
    if (stage(result, "repository")?.status !== "complete") {
      for (const item of result.actions) process.stderr.write(`Next: ${item.action}.\n`);
      process.exitCode = 6;
      return;
    }
    const doctor = yield* execFileClosedStdin(process.execPath, [fileURLToPath(import.meta.url), "--doctor"], {
      cwd, env: process.env, maxBuffer: 1024 * 1024,
      input: JSON.stringify({ version: 1, operation: "doctor", cwd, ...hostFields(host) }),
      timeout: 10_000,
    });
    if (!doctor.succeeded) {
      process.stderr.write(`Readiness check could not complete. Run hapsland setup ${host} again or hapsland doctor ${host}.\n`);
      process.exitCode = 6;
      return;
    }
    const diagnosisResult = yield* Effect.try(() => JSON.parse(doctor.stdout)).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({
        status: Schema.String,
        nextSteps: Schema.optionalKey(Schema.Array(Schema.Struct({ action: Schema.String }))),
        checks: Schema.optionalKey(Schema.Array(Schema.Struct({ stage: Schema.String, status: Schema.String }))),
      }))),
      Effect.result,
    );
    if (diagnosisResult._tag === "Failure") {
      process.stderr.write(`Readiness result was unreadable. Rerun hapsland setup ${host} or hapsland doctor ${host}.\n`);
      process.exitCode = 6;
      return;
    }
    const diagnosis = diagnosisResult.success;
    process.stderr.write(`Offline readiness: ${diagnosis.status}.\n`);
    for (const next of diagnosis.nextSteps ?? []) process.stderr.write(`Next: ${next.action}.\n`);
    for (const check of diagnosis.checks ?? []) if (check.status !== "ready") process.stderr.write(`${check.stage}: ${check.status}.\n`);
    process.stderr.write(`After native ${hostName} repository and hook trust, make an ordinary supported edit and inspect review activity.\n`);
});

const chooseSetupClients = Effect.fn("InteractiveSetup.chooseClients")(function* () {
  if (!process.stdin.isTTY || !process.stderr.isTTY) throw new Error("Guided setup needs a terminal. Use --setup JSON for automation.");
  const choices: ClientChoice[] = yield* Effect.forEach(["claude", "codex"] as const, Effect.fn("InteractiveSetup.clientChoice")(function* (host) {
    const fields = hostFields(host);
    const inspection = fields.host === "claude" ? yield* inspectClaudeInstallation(fields) : yield* inspectCodexInstallation(fields);
    const decoded = Schema.decodeUnknownSync(Schema.Struct({ status: Schema.String, installed: Schema.optionalKey(Schema.Boolean) }))(inspection);
    let status: ClientChoice["status"] = decoded.installed === true ? "installed"
      : ["conflict", "partial"].includes(decoded.status) ? "needs attention" : "not installed";
    if (fields.host === "codex" && status === "not installed") {
      const target = yield* previewCodexUpdate(fields);
      // An owned registration may point to a different retained package.
      if (target.status === "preview") status = "installed";
      else if (target.status === "unsupported") status = "unavailable";
    }
    if (fields.host === "claude" && status === "not installed" && (yield* previewClaudeInstallation(fields)).status === "unsupported") status = "unavailable";
    return { host, name: host === "claude" ? "Claude Code" : "Codex CLI", status };
  }));
  const hosts = yield* selectSetupClients(choices);
  if (hosts.length === 0) { process.stderr.write("No clients selected. No changes made.\n"); return; }
  for (const host of hosts) {
    const result = yield* pilotSetup(host).pipe(
      Effect.catchDefect((cause) => Effect.fail(cause)), Effect.result,
    );
    if (result._tag === "Failure") {
      process.stderr.write(`${host}: ${result.failure instanceof Error ? result.failure.message : "Setup failed"}\n`);
      process.exitCode = 6;
    }
  }
});

const updateInteractive = Effect.fn("InteractiveUpdate.run")(function* () {
  if (!process.stdin.isTTY || !process.stderr.isTTY) throw new Error("Interactive update needs a terminal. Use --update-preview / --update JSON operations for automation.");
  const explicitHost = flagValue("--host") !== undefined || positionalHost() !== undefined;
  const hosts: SetupClient[] = [];
  const outcomes = new Map<SetupClient, "updated" | "already current" | "skipped" | "failed">();
  const failed = (host: SetupClient, cause: unknown) => {
    process.stderr.write(`${host}: ${cause instanceof Error ? cause.message : "Update failed"}\n`);
    outcomes.set(host, "failed"); process.exitCode = 6;
  };
  if (explicitHost) hosts.push(selectedHost());
  else hosts.push(...registeredClients(clientArguments?.flags ?? new Map(), failed));
  if (hosts.length === 0) {
    process.stderr.write(outcomes.size === 0 ? "No Hapsland integrations found. Run hapsland setup first.\n" : "No client registrations could be selected for update. Resolve the reported discovery errors.\n");
    return;
  }
  process.stderr.write(`Update clients: ${hosts.join(", ")}.\n`);
  const target = flagValue("--target");
  if (target !== undefined && ["--tarball", "--version", "--channel"].some(flag => flagValue(flag) !== undefined)) {
    throw new Error("--target cannot be combined with --tarball, --version, or --channel");
  }
  let executable: string;
  if (target !== undefined) executable = target;
  else {
    const channel = flagValue("--channel") ?? "latest";
    if (channel !== "latest" && channel !== "next") throw new Error("--channel must be latest or next");
    const archive = flagValue("--tarball");
    const version = flagValue("--version");
    if (archive !== undefined && (version !== undefined || flagValue("--channel") !== undefined)) throw new Error("select either --tarball or a registry channel/version");
    const selection: ReleaseSelection = archive === undefined
      ? { kind: "registry", channel, ...(version === undefined ? {} : { version }) }
      : { kind: "archive", path: archive };
    process.stderr.write(`Select ${archive ?? `@hapsland/hapsland@${version ?? channel}`}; reuse a verified package when available. The previous package is retained.\n`);
    const staged = yield* stageRelease(selection);
    executable = staged.executable;
    process.stderr.write(`Target ${staged.packageVersion}: ${executable}\n`);
  }
  const childEnvironment = { ...process.env };
  delete childEnvironment.REVIEW_INSTALL_RUNTIME;
  delete childEnvironment.REVIEW_INSTALL_ENTRYPOINT;
  const invoke = Effect.fn("InteractiveUpdate.invoke")(function* (host: SetupClient, operation: "update-preview" | "update", proposalDigest?: string) {
    const output = yield* invokeLifecycle(executable, [`--${operation}`], host, { version: 1, operation, ...hostFields(host), ...(proposalDigest === undefined ? {} : { proposalDigest }) }, childEnvironment);
    for (const line of formatProposal(output.proposal)) process.stderr.write(`${line}\n`);
    return output;
  });
  const proposals: Array<{ host: SetupClient; digest: string }> = [];
  for (const host of hosts) {
    try {
      process.stderr.write(`Preview ${host}:\n`);
      const previewResult = yield* invoke(host, "update-preview").pipe(Effect.result);
      if (previewResult._tag === "Failure") { failed(host, previewResult.failure); continue; }
      const preview = previewResult.success;
      if (!["preview", "partial"].includes(preview.status) || preview.proposal === undefined) throw new Error("target did not return an applicable update preview");
      if (preview.alreadyCurrent === true || preview.proposal.changes?.length === 0) { outcomes.set(host, "already current"); const activation = yield* activatePackage(executable).pipe(Effect.result); if (activation._tag === "Failure") failed(host, activation.failure); }
      else proposals.push({ host, digest: preview.proposal.digest });
    } catch (cause) { failed(host, cause); }
  }
  if (proposals.length > 0) {
    const apply = yield* askConfirmation(`Apply these changes to ${proposals.map(proposal => proposal.host).join(", ")} profiles?`);
    for (const proposal of proposals) {
      if (!apply) { outcomes.set(proposal.host, "skipped"); continue; }
      try {
        const invocation = yield* invoke(proposal.host, "update", proposal.digest).pipe(Effect.result);
        if (invocation._tag === "Failure") { failed(proposal.host, invocation.failure); continue; }
        const result = invocation.success;
        if (result.status === "partial") {
          const activation = yield* activatePackage(executable).pipe(Effect.result);
          if (activation._tag === "Failure") { failed(proposal.host, activation.failure); continue; }
          throw new Error(`${formatFailure(result, proposal.host)} Next: hapsland repair ${proposal.host}. The selected package is retained for recovery.`);
        }
        if (!["updated", "complete", "already-current"].includes(result.status)) throw new Error(formatFailure(result, proposal.host));
        outcomes.set(proposal.host, result.status === "already-current" ? "already current" : "updated");
        const activation = yield* activatePackage(executable).pipe(Effect.result);
        if (activation._tag === "Failure") failed(proposal.host, activation.failure);
      } catch (cause) { failed(proposal.host, cause); }
    }
  }
  for (const [host, status] of outcomes) {
    process.stderr.write(`${host}: ${status}.\n`);
    if (status === "updated") process.stderr.write(`Finish current work, restart ${host}, and review native trust prompts.\n`);
  }
  process.stderr.write("Retain previous packages until their hooks and active sessions no longer depend on them.\n");
});

const reportClientFailure = (host: SetupClient, cause: unknown) => { process.stderr.write(`${host}: ${cause instanceof Error ? cause.message : "operation failed"}\n`); process.exitCode = 6; };

const maintenanceInteractive = Effect.fn("InteractiveMaintenance.run")(function* (command: "repair" | "reinstall" | "uninstall") {
  if (!process.stdin.isTTY || !process.stderr.isTTY) throw new Error(`${command} needs a terminal. Use the version-one installation JSON interface for automation.`);
  const hosts = clientArguments?.host === undefined ? registeredClients(clientArguments?.flags ?? new Map(), reportClientFailure) : [selectedHost()];
  if (hosts.length === 0) {
    if (command === "reinstall") yield* activateCurrentPackage(fileURLToPath(import.meta.url));
    process.stderr.write("No Hapsland integrations found. Run hapsland setup first.\n"); return;
  }
  for (const host of hosts) {
    try {
      const fields = hostFields(host);
      const reinstall = command === "reinstall";
      const installed = fields.host === "claude" ? hasClaudeRegistration(fields) : hasCodexRegistration(fields);
      const inspectionResult = fields.host === "claude" ? yield* inspectClaudeInstallation(fields).pipe(Effect.result) : yield* inspectCodexInstallation(fields).pipe(Effect.result);
      if (inspectionResult._tag === "Failure") { reportClientFailure(host, inspectionResult.failure); continue; }
      const inspection = inspectionResult.success;
      const recovered = Schema.decodeUnknownSync(Schema.Struct({ recovery: Schema.optionalKey(Schema.Struct({ operation: Schema.String })) }))(inspection).recovery?.operation;
      const operation = command === "repair" && (recovered === "install" || recovered === "update" || recovered === "uninstall") ? recovered : command === "uninstall" ? "uninstall" : fields.host === "claude" && installed && !reinstall ? "update" : "install";
      const invoke = (digest?: string) => {
        const request = { version: 1, ...fields, operation: digest === undefined && operation !== "uninstall" ? `${operation}-preview` : operation, ...(reinstall && operation === "install" ? { reinstall: true } : {}), ...(digest === undefined ? {} : { proposalDigest: digest }) };
        const output = invokeLifecycle(process.execPath, [fileURLToPath(import.meta.url), `--${request.operation}`], host, request);
        return output;
      };
      const previewResult = yield* invoke().pipe(Effect.result);
      if (previewResult._tag === "Failure") { reportClientFailure(host, previewResult.failure); continue; }
      const preview = previewResult.success;
      if (preview.status === "already-uninstalled") { process.stderr.write(`${host}: already removed.\n`); continue; }
      if (!["preview", "partial"].includes(preview.status) || preview.proposal === undefined) throw new Error(formatFailure(preview, host));
      if (preview.proposal.changes?.length === 0) { process.stderr.write(`${host}: ${command === "uninstall" ? "already removed" : "integration intact"}.\n`); continue; }
      if (recovered !== undefined && command === "repair") process.stderr.write(`Resume interrupted ${operation}; after completion rerun hapsland repair ${host} if needed.\n`);
      process.stderr.write(`${host} ${command} preview:\n${formatProposal(preview.proposal).join("\n")}\n`);
      if (reinstall) process.stderr.write("Replace marked Hapsland handlers; preserve independent hooks, review settings and saved credentials.\n");
      const confirmation = yield* askConfirmation(`Apply ${command} to ${host}?`).pipe(Effect.result);
      if (confirmation._tag === "Failure") {
        reportClientFailure(host, confirmation.failure);
        continue;
      }
      if (!confirmation.success) { process.stderr.write(`${host}: skipped.\n`); continue; }
      const invocation = yield* invoke(preview.proposal.digest).pipe(Effect.result);
      if (invocation._tag === "Failure") { reportClientFailure(host, invocation.failure); continue; }
      const result = invocation.success;
      if (result.status === "partial" && operation !== "uninstall") {
        const activation = yield* activateCurrentPackage(fileURLToPath(import.meta.url)).pipe(Effect.result);
        if (activation._tag === "Failure") { reportClientFailure(host, activation.failure); continue; }
      }
      if (!["complete", "installed", "already-installed", "updated", "already-current", "uninstalled", "already-uninstalled", "removed", "already-removed"].includes(result.status)) throw new Error(formatFailure(result, host));
      if (operation !== "uninstall") {
        const activation = yield* activateCurrentPackage(fileURLToPath(import.meta.url)).pipe(Effect.result);
        if (activation._tag === "Failure") { reportClientFailure(host, activation.failure); continue; }
      }
      process.stderr.write(`${host}: ${operation === "uninstall" ? "removed" : "restored"}. User settings and credentials preserved.\n`);
      process.stderr.write(`Finish current work and restart ${host}${operation === "uninstall" ? "." : "; review native trust prompts."}\n`);
    } catch (cause) { process.stderr.write(`${host}: ${cause instanceof Error ? cause.message : "operation failed"}\n`); process.exitCode = 6; }
  }
});

const diagnoseClientProcess = Effect.fn("HumanDoctor.diagnoseClient")(function* (host: SetupClient) {
  const result = yield* execFileClosedStdin(process.execPath, [fileURLToPath(import.meta.url), "--doctor"], {
    input: JSON.stringify({ version: 1, operation: "doctor", cwd: process.cwd(), ...hostFields(host) }),
    env: process.env, timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  if (result.timedOut) return yield* Effect.fail(new Error("doctor request deadline exceeded"));
  const diagnosis: unknown = yield* Effect.try(() => JSON.parse(result.stdout));
  const checked = yield* Schema.decodeUnknownEffect(Schema.Struct({ status: Schema.String }))(diagnosis);
  return { diagnosis, status: checked.status, exitCode: result.exitCode };
});

if (cliSwitch("package-identity")) {
  process.stdout.write(JSON.stringify({ name: "@hapsland/hapsland", runtime: process.execPath, entrypoint: fileURLToPath(import.meta.url) }) + "\n");
} else if (cliSwitch("pilot") || invocation.kind === "lifecycle") {
  try {
    const command = invocation.kind === "lifecycle" ? invocation.command : "setup";
    clientArguments = invocation.client;
    const selectedPackage = clientArguments.flags.get("--target");
    const dispatched = selectedPackage !== undefined && command !== "update"
      ? await Effect.runPromise(dispatchSelectedPackage(selectedPackage, command, clientArguments.host, clientArguments.flags).pipe(Effect.provide(processConfigurationLayer)))
      : await Effect.runPromise(dispatchActivePackage([command, ...(clientArguments.host === undefined ? [] : [clientArguments.host]), ...[...clientArguments.flags].filter(([name]) => name !== "--host").flatMap(([name, value]) => [name, value])]).pipe(Effect.provide(processConfigurationLayer)));
    if (dispatched !== undefined) process.exitCode = dispatched;
    else if (command === "doctor") {
      const hosts = clientArguments.host === undefined ? registeredClients(clientArguments.flags, reportClientFailure) : [selectedHost()];
      if (hosts.length === 0) process.stderr.write("No Hapsland integrations found. Run hapsland setup first.\n");
      for (const host of hosts) {
        try {
          const result = await Effect.runPromise(diagnoseClientProcess(host).pipe(Effect.provide(processConfigurationLayer)));
          process.stdout.write(formatDoctor(result.diagnosis, host).join("\n") + "\n");
          if (result.exitCode !== 0 || result.status === "not-ready") process.exitCode = result.exitCode || 6;
        } catch (cause) { reportClientFailure(host, cause); }
      }
    } else if (command === "update") await Effect.runPromise(updateInteractive().pipe(Effect.provide(processConfigurationLayer)));
    else if (command === "repair" || command === "reinstall" || command === "uninstall") await Effect.runPromise(maintenanceInteractive(command).pipe(Effect.provide(processConfigurationLayer)));
    else if (clientArguments.host === undefined) await Effect.runPromise(chooseSetupClients().pipe(Effect.provide(processConfigurationLayer)));
    else await Effect.runPromise(pilotSetup(selectedHost()).pipe(Effect.provide(processConfigurationLayer)));
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : "Interactive operation failed"}\n`);
    process.exitCode = 6;
  }
} else {
const runReviewProgram = Effect.fn("ReviewCli.run")(function* () {
  const watchdog = isClaudeHook || isOpenCodeHook
    ? yield* Effect.sleep(Math.max(0, directHookStartedAt + 4_500 - (yield* hookMonotonicMillis))).pipe(
        Effect.andThen(Effect.sync(() => { process.exit(0); })),
        Effect.forkScoped,
      )
    : undefined;
  const output = yield* program;
  const writeResult = isDirectEventReady(output)
    ? yield* submitDirectHookOutput(output, { composed: isComposedEditHook, claude: isClaudeHook, deadlineAt: directHookDeadline })
    : composedKind === undefined && (isClaudeHook || isCodexHook)
      ? yield* (yield* HookOutput).writeEncoded(
          typeof output === "string" ? output : `${JSON.stringify(output)}\n`, directHookDeadline,
        )
    : undefined;
  const timedOut = writeResult === "timed-out";
  if (timedOut && watchdog !== undefined) yield* Fiber.join(watchdog);
  return output;
}, Effect.scoped);
const output = isCredentialCommand
  ? await Effect.runPromise(runCredentialCommand().pipe(Effect.provide(processConfigurationLayer)))
  : await Effect.runPromise(runReviewProgram().pipe(Effect.provide(processConfigurationLayer), Effect.provide(directHookSubmissionLayer), Effect.provide(composedHookRuntimeLayer), Effect.provide(hookOutputLayer), Effect.provide(residentStartupLayer)));
if (composedKind === undefined && !isCodexHook && !isClaudeHook && !isOpenCodeHook && typeof output === "object" && output !== null) {
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
if (!isDirectEventReady(output)) {
  if (isOpenCodeHook || isClaudeHook || isCodexHook || composedKind !== undefined) {
    // The plugin treats empty stdout as a quiet skip.
  } else
  if (isCredentialCommand && !cliSwitch("json") && !cliSwitch("credential-stdin") && process.stdin.isTTY) {
    const result = output as Readonly<Record<string, unknown>>;
    if (result.operation === "login" && result.status === "stored") {
      process.stdout.write(`Jev key saved in ${process.platform === "darwin" ? "Keychain" : "Secret Service"}. No Jev request or review was sent.\nNext: run hapsland setup claude or hapsland setup codex, then complete client sign-in and native trust.\n`);
    } else {
      const next = result.action ?? (result.operation === "logout"
        ? "Use user file exclusions to stop future review dispatches if needed."
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
        if (environment?.active === true) process.stdout.write(`${environment.envVar ?? "The selected environment credential"} remains active; set user excludes to ["**/*"] to stop dispatch.\n`);
      }
    }
  } else {
    process.stdout.write(typeof output === "string" ? output : `${JSON.stringify(output)}\n`);
  }
}
}
