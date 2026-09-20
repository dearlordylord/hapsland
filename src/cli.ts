import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { Consent } from "./runtime/consent.ts";
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
import { decodeReviewRequest, type ReviewRequest } from "./domain/contracts.ts";
import { ReviewBackend } from "./ports/review-backend.ts";
import { DedupeStore } from "./ports/dedupe-store.ts";
import { SnapshotReader } from "./ports/snapshot-reader.ts";
import { review } from "./runtime/review.ts";
import {
  controlledDecisionModelLayer,
  type ControlledDecisionModelOptions,
} from "./test-support/controlled-decision-model.ts";

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

const ConsentOperation = Schema.Struct({
  version: Schema.optionalKey(Schema.Literal(1)),
  operation: Schema.optionalKey(
    Schema.Literals(["enable", "disable", "credentials", "status"]),
  ),
  cwd: Schema.optionalKey(Schema.String),
  backend: Schema.optionalKey(Schema.String),
  destination: Schema.optionalKey(Schema.String),
  credentialEnvVar: Schema.optionalKey(Schema.String),
});
type ConsentOperation = typeof ConsentOperation.Type;

const statePathConfig = Config.String("REVIEW_STATE_PATH").pipe(
  Config.orElse(() => Config.String("REVIEW_CONSENT_FILE")),
  Config.withDefault(join(homedir(), ".config", "realtime-review-tool", "consent")),
);

const forcedOperation = (): ConsentOperation["operation"] => {
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
  return undefined;
};

const decodeOperation = (input: string, forced: ConsentOperation["operation"]) =>
  decodeJson(input).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(ConsentOperation, {
        onExcessProperty: "error",
      })(value),
    ),
    Effect.map((operation) => {
      const withCwd = operation.cwd === undefined
        ? { ...operation, cwd: process.cwd() }
        : operation;
      const selected = forced ?? operation.operation;
      return selected === undefined
        ? withCwd
        : { ...withCwd, operation: selected };
    }),
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

const preflight = (request: ReviewRequest, statePath: string) =>
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
    const settings = yield* loadReviewSettings(root);
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
  statePath: string,
) => {
  const decisionModel =
    controlled === undefined
      ? jevDecisionModelLiveLayer({
          apiUrl: settings.destination,
          credentialEnvVar: settings.credentialEnvVar,
        })
      : controlledDecisionModelLayer(controlled);
  return Layer.mergeAll(
    Consent.layer({ statePath }),
    SnapshotReader.layer,
    DedupeStore.layer,
    ReviewBackend.layer.pipe(Layer.provide(decisionModel)),
  );
};

const runRequest = (
  request: ReviewRequest,
  controlled: ControlledDecisionModelOptions | undefined,
  settings: ReviewSettings,
  statePath: string,
) => review(request).pipe(Effect.provide(runtimeLayer(controlled, settings, statePath)));

const isCodexHook = process.argv.includes("--codex-hook");
const isControlled = process.argv.includes("--controlled");
const requestedOperation = forcedOperation();

const runOperation = (operation: ConsentOperation, statePath: string) =>
  Effect.gen(function* () {
    const consent = yield* Consent.Service;
    const cwd = operation.cwd ?? process.cwd();
    const root = yield* consent.discoverRoot(cwd);
    const settings = yield* loadReviewSettings(root);
    const backend = operation.backend ?? settings.backend ?? DEFAULT_BACKEND;
    const destination = operation.destination ?? settings.destination ?? DEFAULT_DESTINATION;
    const credentialEnvVar =
      operation.credentialEnvVar ?? settings.credentialEnvVar ?? DEFAULT_CREDENTIAL_ENV_VAR;
    switch (operation.operation) {
      case "enable": {
        const identity = yield* consent.enable(cwd, backend, destination);
        return {
          version: 1,
          operation: "enable",
          status: "enabled",
          repository: { canonicalRoot: identity.root },
          backend: { id: identity.backend, destination: identity.destination },
          scope: "repository-wide eligible source files",
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
      case "status": {
        const grants = yield* consent.list();
        return {
          version: 1,
          operation: "status",
          repository: { canonicalRoot: root },
          grants: grants.map((grant) => ({
            backend: grant.backend,
            destination: grant.destination,
            scope: "repository-wide eligible source files",
          })),
          projectAuthorizationIgnored: settings.projectRequestedConsent,
        };
      }
      default:
        return yield* Effect.fail(new Error("unsupported operation"));
    }
  }).pipe(Effect.provide(Consent.layer({ statePath })));

const runReviewRequest = (
  request: ReviewRequest,
  controlled: ControlledDecisionModelOptions | undefined,
  statePath: string,
) =>
  Effect.gen(function* () {
    const authorization = yield* preflight(request, statePath).pipe(Effect.result);
    if (authorization._tag === "Failure") {
      return defaultResponse(
        request,
        "invalid_configuration",
        "review configuration or consent state is unavailable",
      );
    }
    if (authorization.success.authorization.status !== "approved") {
      return noConsentResponse(request, authorization.success.authorization);
    }
    if (controlled === undefined) {
      const present = yield* Config.option(
        Config.String(authorization.success.settings.credentialEnvVar),
      ).pipe(Effect.map((value) => Option.isSome(value) && value.value.length > 0));
      if (!present) {
        return defaultResponse(
          request,
          "missing_credentials",
          `review credential is unavailable; set ${authorization.success.settings.credentialEnvVar}`,
        );
      }
    }
    return yield* runRequest(
      request,
      controlled,
      authorization.success.settings,
      statePath,
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
  });

const program = Effect.gen(function* () {
  const input = yield* readStdin;
  const statePath = yield* statePathConfig;

  const inputRequestsOperation = /"operation"\s*:\s*"(?:enable|disable|credentials|status)"/.test(
    input,
  );
  if (requestedOperation !== undefined || inputRequestsOperation) {
    const operation = yield* decodeOperation(input, requestedOperation);
    if (operation.operation !== undefined) {
      return yield* runOperation(operation, statePath);
    }
  }

  const controlled = isControlled ? yield* controlledOptions : undefined;

  if (isCodexHook) {
    const event = yield* decodeCodexJson(input);
    const request = toReviewRequest(event);
    if (request === undefined) return {};
    const response = yield* runReviewRequest(request, controlled, statePath);
    return toCodexOutput(response);
  }

  const unknownRequest = yield* decodeJson(input);
  const request = yield* decodeReviewRequest(unknownRequest);
  return yield* runReviewRequest(request, controlled, statePath);
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
process.stdout.write(`${JSON.stringify(output)}\n`);
