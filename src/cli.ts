#!/usr/bin/env node
import * as Schedule from "effect/Schedule";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { homedir } from "node:os";
import { join } from "node:path";
import { closeSync, constants, openSync, readFileSync, readSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
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
  admitTicketedObservationEffect,
  collectOutcomeEffect,
  ensureResidentEffect,
  ResidentStartup,
  residentStartupLayer,
  inspectResidentEffect,
  makeResidentDispatchContextEffect,
  type CollectedAdvice,
} from "./resident/client.ts";
import { hookOutputLayer } from "./resident/hook-output.ts";
import { composedHookRuntimeLayer, runComposedHookEffect, type ComposedHookKind, type ComposedHookHost } from "./resident/composed-hook.ts";
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
import { stageRelease, type ReleaseSelection } from "./onboarding/distribution.ts";
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

const statePathConfig = Config.String("REVIEW_STATE_PATH").pipe(
  Config.orElse(() => Config.String("REVIEW_CONSENT_FILE")),
  Config.withDefault(join(homedir(), ".config", "realtime-review-tool", "consent")),
);

const activityPathConfig = Config.String("REVIEW_ACTIVITY_PATH").pipe(
  Config.withDefault(join(homedir(), ".local", "state", "realtime-review-tool", "activity")),
);

const userConfigPathConfig = Config.option(Config.String("REVIEW_USER_CONFIG_PATH"));

const forcedOperation = (): ReviewOperation["operation"] | undefined => {
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

const isCodexHook = process.argv.includes("--codex-hook");
const isClaudeHook = process.argv.includes("--claude-hook");
const isOpenCodeHook = process.argv.includes("--opencode-hook");
const isComposedEditHook = process.argv.includes("--composed-edit-hook");
const composedKind: ComposedHookKind | undefined = process.argv.includes("--composed-before-edit-hook")
  ? "before-edit" : process.argv.includes("--composed-background-hook")
  ? "background" : process.argv.includes("--composed-stop-hook")
    ? "stop" : process.argv.includes("--composed-prompt-hook") ? "prompt" : undefined;
const composedHost: ComposedHookHost = process.argv.includes("--composed-host=claude-code")
  ? "claude-code" : "codex-cli";
const directHookStartedAt = performance.now();
const directHookDeadline = directHookStartedAt +
  (isCodexHook && isComposedEditHook ? 9_000 : 3_900);
const hookVersionArgument = process.argv.find((argument) => argument.startsWith("--codex-version="));
const requestedHookVersion = hookVersionArgument?.slice("--codex-version=".length);
if (isCodexHook && (isComposedEditHook || composedKind !== undefined) && requestedHookVersion !== undefined && !isCodexHostVersion(requestedHookVersion)) {
  throw new Error("unsupported Codex hook version");
}
const codexHookVersion: CodexHostVersion = isCodexHostVersion(requestedHookVersion) ? requestedHookVersion : "0.155.1";
const isControlledReviewer = process.argv.includes("--controlled-reviewer");
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
      recordDemoTrace(process.env.REVIEW_DEMO_BUDGET_PATH, observation.root, observation.advicee, { kind: "edit" });
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
  const remaining = () => Math.max(0, deadline - performance.now());
  const bounded = <A, E, R>(task: Effect.Effect<A, E, R>): Effect.Effect<A | undefined, never, R> =>
    Effect.suspend(() => {
      const time = remaining();
      if (time <= 0) return Effect.succeed(undefined);
      return task.pipe(
        Effect.timeoutOrElse({ duration: time, orElse: () => Effect.succeed(undefined) }),
        Effect.catch(() => Effect.succeed(undefined)),
      );
    });
  const dispatch = yield* bounded(makeResidentDispatchContextEffect(
    observation.root, statePath, activityPath, userConfigPath, controlled,
  ));
  if (dispatch === undefined) return {};
  const accepted = yield* bounded(admitTicketedObservationEffect(observation, dispatch, undefined, isComposedEditHook));
  if (accepted?.status !== "accepted") return {};
  const pass = Effect.gen(function* () {
    if (remaining() <= 150) return { done: true, output: {} };
    const outcome = yield* bounded(collectOutcomeEffect(accepted.admission));
    if (outcome?.status === "advice") {
      return { done: true, output: { _tag: "DirectEventReady", value: outcome.advice.output, collected: outcome.advice } };
    }
    return { done: outcome?.status !== "pending", output: {} };
  });
  const result = yield* pass.pipe(Effect.repeat({
    schedule: Schedule.spaced("50 millis"),
    until: (result) => result.done || remaining() <= 150,
  }));
  return result.output;
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
      const credentialResolution = yield* Effect.promise(() => resolveCredential({
        envVar: credentialEnvVar,
        environmentOnly: settings !== undefined &&
          settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in",
      }));
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
        activitySource: "resident-v1",
      };
      return operation.format === "human"
        ? `readiness: ${readinessStatus} (configuration=${configurationStatus}, files=${output.readiness.fileSelection}, credentials=${credentials ? "present" : "absent"})\n${formatActivityHuman(operation.sessionId ?? "<session id required>", residentActivity)}`
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
      allowLive: process.argv.includes("--evaluation-live"),
      credentialEnvVar: process.env.EVALUATION_CREDENTIAL_ENV ?? "TYPESAFE_API_KEY",
      ...(isControlledReviewer ? { controlled: yield* controlledOptions } : {}),
    });
  }
  if (process.argv.includes("--setup") || inputRequestsSetup) {
    const operation: SetupOperation = yield* decodeSetupOperation(input);
    return yield* runSetup(operation, {
      statePath,
      ...(userConfigPath === undefined ? {} : { userConfigPath }),
      ...(operation.interactive === true ? { readCredential: readMaskedCredential } : {}),
    });
  }
  if (process.argv.includes("--demo") || inputRequestsFirstReviewDemo) {
    const operation: FirstReviewDemoOperation = yield* decodeFirstReviewDemoOperation(input);
    const demoStatePath = process.env.REVIEW_DEMO_STATE_PATH ??
      join(homedir(), ".local", "state", "realtime-review-tool", "demos");
    return yield* runFirstReviewDemo(operation, { statePath: demoStatePath });
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
  process.stdout.write(`Hapsland — Claude Code and Codex review integration

  hapsland setup claude       Guided Claude Code setup
  hapsland setup codex        Guided Codex CLI setup
  hapsland update claude      Stage stable release and update Claude hooks
  hapsland update codex       Stage stable release and update Codex hooks
  hapsland update codex --channel=next   Opt into a published candidate
  hapsland update claude --tarball=/absolute/candidate.tgz
  hapsland --pilot --host=codex          Guided setup in a terminal
  hapsland --login            Save a Jev key with masked entry
  hapsland doctor claude      Offline readiness in the current repository
  hapsland doctor codex       Offline readiness in the current repository
  hapsland --doctor           Offline readiness check (JSON request on stdin)
  hapsland --logout           Remove the saved Jev key

Hapsland uses Jev as its external review backend. With an installed runtime
and Jev credentials, effective file settings select eligible files by default.
Set user excludes to ["**/*"] to turn review off.
For automation, use the versioned --setup operation documented in docs/claude-installation.md and docs/codex-installation.md.
`);
};

const flagValue = (name: string): string | undefined =>
  process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);

const selectedHost = (): "claude" | "codex" => {
  const host = flagValue("--host") ?? ((process.argv[2] === "setup" || process.argv[2] === "update" || process.argv[2] === "doctor") ? process.argv[3] : undefined) ?? "codex";
  if (host !== "claude" && host !== "codex") throw new Error("select claude or codex (for example: hapsland setup claude)");
  return host;
};
const hostFields = (host: "claude" | "codex") => {
  const home = flagValue(`--${host}-home`);
  const executable = flagValue(`--${host}-executable`);
  return host === "claude"
    ? { host, ...(home === undefined ? {} : { claudeHome: home }), ...(executable === undefined ? {} : { claudeExecutable: executable }) }
    : { host, ...(home === undefined ? {} : { codexHome: home }), ...(executable === undefined ? {} : { codexExecutable: executable }) };
};
const askConfirmation = async (question: string) => {
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try { return (await prompt.question(`${question} [y/N] `)).trim().toLowerCase() === "y"; }
  finally { prompt.close(); }
};

const pilotSetup = async () => {
  const host = selectedHost();
  const hostName = host === "claude" ? "Claude Code" : "Codex";
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    process.stderr.write("Guided setup needs a terminal. Run hapsland --pilot there, or use hapsland --setup with a versioned JSON request.\n");
    process.exitCode = 6;
    return;
  }
  const statePath = process.env.REVIEW_STATE_PATH ?? process.env.REVIEW_CONSENT_FILE ??
    join(homedir(), ".config", "realtime-review-tool", "consent");
  const cwd = process.cwd();
  let request: SetupOperation = {
    version: 1,
    operation: "setup",
    ...hostFields(host),
    scope: { cwd, review: "enabled" },
    credential: "saved",
  };
  let credentialEntered = false;
  const run = (step: SetupOperation) => Effect.runPromise(runSetup(step, {
    statePath,
    ...(process.env.REVIEW_USER_CONFIG_PATH === undefined ? {} : { userConfigPath: process.env.REVIEW_USER_CONFIG_PATH }),
    readCredential: async () => {
      const value = await readMaskedCredential();
      credentialEntered = true;
      return value;
    },
  }));
  const stage = (result: Awaited<ReturnType<typeof run>>, name: string) =>
    result.stages.find((item) => item.stage === name);
  const action = (result: Awaited<ReturnType<typeof run>>, code: string) =>
    result.actions.find((item) => item.code === code);
    process.stderr.write(`${hostName} review integration setup. Selected profile hooks apply across repositories according to file settings. No Jev call is made during setup.\n`);
    let result = await run(request);
    process.stderr.write(`Compatibility: ${stage(result, "compatibility")?.summary ?? "unavailable"}.\n`);
    if (stage(result, "compatibility")?.status !== "complete") {
      process.stderr.write(`${result.actions[0]?.action ?? `Use a declared ${hostName} profile.`}\n`);
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
      if (!await askConfirmation(`Install these entries in the selected ${hostName} profile?`)) {
        process.stderr.write(`Installation was not changed. Run hapsland setup ${host} to resume.\n`);
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
    process.stderr.write(`Repository: ${stage(result, "repository")?.summary ?? "unavailable"}.\n`);
    if (stage(result, "repository")?.status !== "complete") {
      for (const item of result.actions) process.stderr.write(`Next: ${item.action}.\n`);
      process.exitCode = 6;
      return;
    }
    const doctor = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--doctor"], {
      cwd,
      input: JSON.stringify({ version: 1, operation: "doctor", cwd, ...hostFields(host) }),
      encoding: "utf8",
      timeout: 10_000,
    });
    if (doctor.status !== 0) {
      process.stderr.write(`Readiness check could not complete. Run hapsland setup ${host} again or hapsland doctor ${host}.\n`);
      process.exitCode = 6;
      return;
    }
    let diagnosis: { status: string; nextSteps?: Array<{ action: string }>; checks?: Array<{ stage: string; status: string }> };
    try { diagnosis = JSON.parse(doctor.stdout) as typeof diagnosis; }
    catch {
      process.stderr.write(`Readiness result was unreadable. Rerun hapsland setup ${host} or hapsland doctor ${host}.\n`);
      process.exitCode = 6;
      return;
    }
    process.stderr.write(`Offline readiness: ${diagnosis.status}.\n`);
    for (const next of diagnosis.nextSteps ?? []) process.stderr.write(`Next: ${next.action}.\n`);
    for (const check of diagnosis.checks ?? []) if (check.status !== "ready") process.stderr.write(`${check.stage}: ${check.status}.\n`);
    process.stderr.write(`After native ${hostName} repository and hook trust, make an ordinary supported edit and inspect review activity.\n`);
};

const updateInteractive = async () => {
  const host = selectedHost();
  if (!process.stdin.isTTY || !process.stderr.isTTY) throw new Error("Interactive update needs a terminal. Use --update-preview / --update JSON operations for automation.");
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
    process.stderr.write(`Acquire ${archive ?? `@hapsland/hapsland@${version ?? channel}`} into a fresh prefix; the active package is retained.\n`);
    if (!await askConfirmation("Download/install this target?")) return;
    const staged = await Effect.runPromise(stageRelease(selection));
    executable = staged.executable;
    process.stderr.write(`Target ${staged.packageVersion}: ${executable}\n`);
  }
  const childEnvironment = { ...process.env };
  delete childEnvironment.REVIEW_INSTALL_RUNTIME;
  delete childEnvironment.REVIEW_INSTALL_ENTRYPOINT;
  const invoke = (operation: "update-preview" | "update", proposalDigest?: string) => {
    const result = spawnSync(executable, [`--${operation}`], {
      input: JSON.stringify({ version: 1, operation, ...hostFields(host), ...(proposalDigest === undefined ? {} : { proposalDigest }) }),
      encoding: "utf8", timeout: 30_000, env: childEnvironment,
    });
    if (result.error !== undefined) throw result.error;
    const output = Schema.decodeUnknownSync(Schema.Struct({
      status: Schema.String,
      proposal: Schema.optionalKey(Schema.Struct({ digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)) })),
    }))(JSON.parse(result.stdout));
    process.stderr.write(result.stdout + "\n");
    if (result.status !== 0) throw new Error(`Target updater returned ${output.status}. Follow its recovery/conflict instructions; keep the target installed.`);
    return output;
  };
  const preview = invoke("update-preview");
  if (preview.status !== "preview" || preview.proposal === undefined) throw new Error("target did not return an applicable update preview");
  if (!await askConfirmation(`Apply these changes to the selected ${host} profile?`)) return;
  const result = invoke("update", preview.proposal.digest);
  if (!["updated", "complete", "already-current"].includes(result.status)) throw new Error(`Update did not complete: ${result.status}`);
  process.stderr.write(`Finish current work, restart ${host}, and review native trust prompts. Retain the previous package until its hooks and active sessions no longer depend on it.\n`);
};

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
} else if (process.argv.includes("--pilot") || process.argv[2] === "setup" || process.argv[2] === "update" || process.argv[2] === "doctor") {
  try {
    if (process.argv[2] === "doctor") {
      const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--doctor"], {
        input: JSON.stringify({ version: 1, operation: "doctor", cwd: process.cwd(), ...hostFields(selectedHost()) }), encoding: "utf8", timeout: 10_000,
      });
      if (result.error !== undefined) throw result.error;
      process.stdout.write(result.stdout); process.stderr.write(result.stderr);
      process.exitCode = result.status ?? 6;
    } else if (process.argv[2] === "update") await updateInteractive();
    else await pilotSetup();
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : "Interactive operation failed"}\n`);
    process.exitCode = 6;
  }
} else {
const runReviewProgram = Effect.fn("ReviewCli.run")(function* () {
  const watchdog = isClaudeHook || isOpenCodeHook
    ? yield* Effect.sleep(Math.max(0, directHookStartedAt + 4_500 - performance.now())).pipe(
        Effect.andThen(Effect.sync(() => { process.exit(0); })),
        Effect.forkScoped,
      )
    : undefined;
  const output = yield* program;
  const writeResult = isDirectEventReady(output)
    ? yield* submitDirectHookOutput(output, { composed: isComposedEditHook, claude: isClaudeHook, deadlineAt: directHookDeadline })
    : undefined;
  const timedOut = writeResult === "timed-out";
  if (timedOut && watchdog !== undefined) yield* Fiber.join(watchdog);
  return output;
}, Effect.scoped);
const output = isCredentialCommand
  ? await runCredentialCommand()
  : await Effect.runPromise(runReviewProgram().pipe(Effect.provide(directHookSubmissionLayer), Effect.provide(composedHookRuntimeLayer), Effect.provide(hookOutputLayer), Effect.provide(residentStartupLayer)));
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
  if (isOpenCodeHook || composedKind !== undefined) {
    // The plugin treats empty stdout as a quiet skip.
  } else
  if (isCredentialCommand && !process.argv.includes("--json") && !process.argv.includes("--credential-stdin") && process.stdin.isTTY) {
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
