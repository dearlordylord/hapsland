import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
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
  adaptCodexAdd,
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
  type CollectedAdvice,
} from "./resident/client.ts";

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
) => review(request, context).pipe(Effect.provide(runtimeLayer(controlled, settings)));

const isCodexHook = process.argv.includes("--codex-hook");
const isControlled = process.argv.includes("--controlled");
const isControlledWriter = process.argv.includes("--controlled-writer");
const requestedOperation = forcedOperation();
const requestedEvaluationOperation = forcedEvaluationOperation();

type DirectHookDispatch =
  | { readonly handled: false }
  | { readonly handled: true; readonly output: unknown };

const runDirectCodexHook = (
  nativeEvent: unknown,
): Effect.Effect<DirectHookDispatch, unknown> =>
  Effect.gen(function* () {
    const record = typeof nativeEvent === "object" && nativeEvent !== null
      ? nativeEvent as Readonly<Record<string, unknown>>
      : undefined;
    const isBash = record?.hook_event_name === "PostToolUse" && record.tool_name === "Bash";
    if (!isCodexNativeApplyPatch(nativeEvent) && !isBash) return { handled: false } as const;
    // Every mapped hook ensures the singleton, including Bash collection-only
    // replies and installations where no initialization command was run.
    const owner = yield* Effect.tryPromise(() => ensureResident()).pipe(Effect.option);
    if (Option.isNone(owner)) return { handled: true, output: {} } as const;
    const reply = yield* adaptCodexReply(nativeEvent);
    const collected = reply === undefined
      ? undefined
      : yield* Effect.tryPromise(() => collectReady(reply.root, reply.recipient)).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        );
    // Bash has no path adaptation and can never create backend work.
    if (isBash) {
      return collected === undefined
        ? { handled: true, output: {} } as const
        : { handled: true, output: { _tag: "DirectEventReady" as const, value: collected.output, collected } } as const;
    }
    const observation = yield* adaptCodexAdd(nativeEvent);
    // The direct dispatcher owns every native apply_patch event. Unsupported
    // shapes remain quiet and can never reach the legacy whole-file runtime.
    if (observation === undefined) {
      return collected === undefined
        ? { handled: true, output: {} } as const
        : { handled: true, output: { _tag: "DirectEventReady" as const, value: collected.output, collected } } as const;
    }
    // Matching reads are not attribution. The hook command must explicitly be
    // installed with this controlled-writer assertion for the supported Add profile.
    yield* Effect.tryPromise(() => admitObservation(observation, isControlledWriter)).pipe(
      Effect.catch(() => Effect.void),
    );
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
      const credentials = yield* Config.option(Config.String(credentialEnvVar)).pipe(
        Effect.map((value) => Option.isSome(value) && value.value.length > 0),
      );
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
          credentials: { envVar: credentialEnvVar, present: credentials },
        },
        activity,
        grants: grants.map((grant) => ({
          backend: grant.backend,
          destination: grant.destination,
          scope: "repository-wide eligible source files",
        })),
        projectAuthorizationIgnored: settings?.projectRequestedConsent ?? false,
      };
      return operation.format === "human"
        ? formatReceiptStatus(
            operation.sessionId ?? "<session id required>",
            `${readinessStatus} (configuration=${configurationStatus}, consent=${output.readiness.consent}, credentials=${credentials ? "present" : "absent"})`,
            activity,
          )
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
        const present = yield* Config.option(Config.String(credentialEnvVar)).pipe(
          Effect.map((value) => Option.isSome(value) && value.value.length > 0),
        );
        return {
          version: 1,
          operation: "credentials",
          credentialEnvVar,
          present,
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
    if (controlled === undefined) {
      const present = yield* Config.option(
        Config.String(authorization.success.settings.credentialEnvVar),
      ).pipe(Effect.map((value) => Option.isSome(value) && value.value.length > 0));
      if (!present) {
        return {
          response: defaultResponse(
            request,
            "missing_credentials",
            `review credential is unavailable; set ${authorization.success.settings.credentialEnvVar}`,
          ),
          diagnosticScope,
        };
      }
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
    const response = yield* runRequest(
      request,
      controlled,
      authorization.success.settings,
      {
        _tag: "authorized",
        root: authorization.success.root,
        consent: authorization.success.consent,
        settings: authorization.success.settings,
      },
    ).pipe(
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
  const userConfigPathOption = yield* userConfigPathConfig;
  const userConfigPath = Option.isSome(userConfigPathOption)
    ? userConfigPathOption.value
    : undefined;

  const inputRequestsOperation = /"operation"\s*:\s*"(?:enable|enable-confirm|disable|credentials|status|explain)"/.test(
    input,
  );
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
  if (requestedOperation !== undefined || inputRequestsOperation) {
    const decodedOperation = yield* decodeOperation(input, requestedOperation);
    const operation =
      forcedStatusFormat() !== undefined && decodedOperation.operation === "status"
        ? { ...decodedOperation, format: "human" as const }
        : decodedOperation;
    if (operation.operation !== undefined) {
      return yield* runOperation(operation, statePath, receiptPath, userConfigPath);
    }
  }

  const controlled = isControlled ? yield* controlledOptions : undefined;

  if (isCodexHook) {
    const nativeEvent = yield* decodeJson(input);
    const direct = yield* runDirectCodexHook(
      nativeEvent,
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

const output = await Effect.runPromise(program);
if (isDirectEventReady(output)) {
  attemptCodexHostOutput(output.value, (encoded) => {
    process.stdout.write(encoded);
  });
  await acknowledgeAdvice(output.collected);
} else {
  process.stdout.write(typeof output === "string" ? output : `${JSON.stringify(output)}\n`);
}
