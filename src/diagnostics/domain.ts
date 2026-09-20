import * as Schema from "effect/Schema";
import { createHash } from "node:crypto";

/**
 * The diagnostic vocabulary is deliberately smaller than the backend's error
 * vocabulary.  Adapter and persistence code must not copy provider messages,
 * paths, credentials, or request material into a diagnostic.
 */
export const DiagnosticProblemCode = Schema.Literals([
  "missing_consent",
  "invalid_configuration",
  "missing_credentials",
  "backend_outage",
]);
export type DiagnosticProblemCode = typeof DiagnosticProblemCode.Type;

export const DiagnosticCode = Schema.Literals([
  "missing_consent",
  "invalid_configuration",
  "missing_credentials",
  "backend_outage",
  "recovery",
]);
export type DiagnosticCode = typeof DiagnosticCode.Type;

const SafeIdentity = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64),
  Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/),
);

/** Scope used for notification suppression. Values are identities, not prose. */
export const DiagnosticScope = Schema.Struct({
  sessionId: SafeIdentity,
  repository: SafeIdentity,
  backend: SafeIdentity,
});
export interface DiagnosticScope extends Schema.Schema.Type<typeof DiagnosticScope> {}

/** Hash host-provided identities before they can enter a protocol observation. */
export const diagnosticIdentity = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const makeDiagnosticScope = (
  sessionId: string,
  repository: string,
  backend: string,
): DiagnosticScope => ({
  sessionId: diagnosticIdentity(sessionId),
  repository: diagnosticIdentity(repository),
  backend: diagnosticIdentity(backend),
});

/** Stable, bounded identity for one problem variant (for example timeout/outage). */
export const DiagnosticProblem = Schema.Struct({
  code: DiagnosticProblemCode,
  identity: SafeIdentity,
});
export interface DiagnosticProblem extends Schema.Schema.Type<typeof DiagnosticProblem> {}

export const DiagnosticEvent = Schema.Struct({
  scope: DiagnosticScope,
  status: Schema.Literals(["healthy", "problem"]),
  problem: Schema.optionalKey(DiagnosticProblem),
});
export interface DiagnosticEvent extends Schema.Schema.Type<typeof DiagnosticEvent> {}

export const DiagnosticNotification = Schema.Struct({
  kind: Schema.Literals(["problem", "recovery"]),
  code: DiagnosticCode,
  changed: Schema.Boolean,
  problem: Schema.optionalKey(DiagnosticProblem),
});
export interface DiagnosticNotification
  extends Schema.Schema.Type<typeof DiagnosticNotification> {}

/**
 * An observation is retained even when its notification is suppressed.  This
 * distinction lets receipts/status code count outcomes without re-announcing
 * the same problem to a host.
 */
export const DiagnosticObservation = Schema.Struct({
  scope: DiagnosticScope,
  status: Schema.Literals(["healthy", "problem"]),
  problem: Schema.optionalKey(DiagnosticProblem),
  notification: Schema.optionalKey(DiagnosticNotification),
  suppressed: Schema.Boolean,
});
export interface DiagnosticObservation
  extends Schema.Schema.Type<typeof DiagnosticObservation> {}

export interface DiagnosticReducerState {
  readonly announced: ReadonlyArray<DiagnosticProblem>;
  readonly active?: DiagnosticProblem;
  /** A recovery is useful only when the active problem was announced. */
  readonly activeWasNotified: boolean;
}

export const initialDiagnosticState: DiagnosticReducerState = {
  announced: [],
  activeWasNotified: false,
};

const problemKey = (problem: DiagnosticProblem): string =>
  `${problem.code}:${problem.identity}`;

export const sameDiagnosticProblem = (
  left: DiagnosticProblem | undefined,
  right: DiagnosticProblem | undefined,
): boolean =>
  left !== undefined &&
  right !== undefined &&
  left.code === right.code &&
  left.identity === right.identity;

export const hasAnnouncedProblem = (
  state: DiagnosticReducerState,
  problem: DiagnosticProblem,
): boolean => state.announced.some((entry) => problemKey(entry) === problemKey(problem));

/** Map product outcome codes to safe, stable diagnostic identities. */
export const problemFromOutcomeCode = (
  code: string,
): DiagnosticProblem | undefined => {
  switch (code) {
    case "missing_consent":
      return { code: "missing_consent", identity: "missing-consent" };
    case "invalid_configuration":
      return { code: "invalid_configuration", identity: "invalid-configuration" };
    case "missing_credentials":
      return { code: "missing_credentials", identity: "missing-credentials" };
    case "backend_unavailable":
      return { code: "backend_outage", identity: "backend-unavailable" };
    case "review_timeout":
      return { code: "backend_outage", identity: "backend-timeout" };
    default:
      return undefined;
  }
};

/**
 * Collapse per-file outcome codes into one event for an edit. The first
 * diagnostic category in this fixed order wins, making result order irrelevant
 * and preventing a healthy file from falsely announcing recovery while another
 * file is still unavailable.
 */
export const eventFromOutcomeCodes = (
  scope: DiagnosticScope,
  codes: ReadonlyArray<string>,
): DiagnosticEvent => {
  const priority = [
    "invalid_configuration",
    "missing_consent",
    "missing_credentials",
    "backend_unavailable",
    "review_timeout",
  ] as const;
  for (const candidate of priority) {
    const problem = problemFromOutcomeCode(
      codes.includes(candidate) ? candidate : "",
    );
    if (problem !== undefined) return problemDiagnosticEvent(scope, problem);
  }
  return healthyDiagnosticEvent(scope);
};

/** Create a healthy event without requiring callers to manufacture a problem. */
export const healthyDiagnosticEvent = (
  scope: DiagnosticScope,
): DiagnosticEvent => ({ scope, status: "healthy" });

export const problemDiagnosticEvent = (
  scope: DiagnosticScope,
  problem: DiagnosticProblem,
): DiagnosticEvent => ({ scope, status: "problem", problem });

export const diagnosticProblemKey = problemKey;

export * as DiagnosticDomain from "./domain.ts";
