import {
  type DiagnosticEvent,
  type DiagnosticNotification,
  type DiagnosticObservation,
  type DiagnosticProblem,
  type DiagnosticReducerState,
  initialDiagnosticState,
  hasAnnouncedProblem,
  sameDiagnosticProblem,
} from "./domain.ts";

export interface DiagnosticReduction {
  readonly state: DiagnosticReducerState;
  readonly observation: DiagnosticObservation;
}

const problemNotification = (
  problem: DiagnosticProblem,
  changed: boolean,
): DiagnosticNotification => ({
  kind: "problem",
  code: problem.code,
  changed,
  problem,
});

const recoveryNotification = (
  problem: DiagnosticProblem,
): DiagnosticNotification => ({
  kind: "recovery",
  code: "recovery",
  changed: false,
  problem,
});

/**
 * Reduce one bounded health observation.  Problem identity is the only input
 * used for suppression; volatile reasons and request IDs never enter state.
 */
export const reduceDiagnostic = (
  state: DiagnosticReducerState = initialDiagnosticState,
  event: DiagnosticEvent,
): DiagnosticReduction => {
  if (event.status === "problem") {
    const problem = event.problem;
    if (problem === undefined) {
      // Boundary callers should decode this before reduction.  Keeping this
      // branch total makes a malformed internal event fail closed without
      // fabricating a user-facing problem.
      return {
        state,
        observation: {
          scope: event.scope,
          status: "problem",
          suppressed: true,
        },
      };
    }

    const sameAsActive = sameDiagnosticProblem(state.active, problem);
    const alreadyAnnounced = hasAnnouncedProblem(state, problem);
    const shouldNotify = !alreadyAnnounced;
    const nextAnnounced = alreadyAnnounced
      ? state.announced
      : [...state.announced, problem];
    const nextState: DiagnosticReducerState = {
      announced: nextAnnounced,
      active: problem,
      activeWasNotified:
        shouldNotify || (sameAsActive && state.activeWasNotified),
    };
    const notification = shouldNotify
      ? problemNotification(problem, state.active !== undefined && !sameAsActive)
      : undefined;
    return {
      state: nextState,
      observation: {
        scope: event.scope,
        status: "problem",
        problem,
        ...(notification === undefined ? {} : { notification }),
        suppressed: !shouldNotify,
      },
    };
  }

  const active = state.active;
  const shouldNotify = active !== undefined && state.activeWasNotified;
  const notification = shouldNotify ? recoveryNotification(active) : undefined;
  return {
    state: {
      announced: state.announced,
      activeWasNotified: false,
    },
    observation: {
      scope: event.scope,
      status: "healthy",
      ...(notification === undefined ? {} : { notification }),
      suppressed: active !== undefined && !shouldNotify,
    },
  };
};

export const DiagnosticReducer = {
  reduce: reduceDiagnostic,
  initial: initialDiagnosticState,
} as const;

export * as Diagnostics from "./reducer.ts";
