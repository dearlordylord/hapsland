import {
  type DiagnosticEvent,
  type DiagnosticNotification,
  type DiagnosticObservation,
  type DiagnosticProblem,
  type DiagnosticReducerState,
  initialDiagnosticState,
  hasAnnouncedProblem,
  hasActiveDiagnostic,
  sameDiagnosticProblem,
} from "./domain.ts";

export interface DiagnosticReduction {
  readonly state: DiagnosticReducerState;
  readonly observation: DiagnosticObservation;
}

const problemNotification = (
  problem: DiagnosticProblem,
  changed: boolean,
): Extract<DiagnosticNotification, { readonly kind: "problem" }> => ({
  kind: "problem",
  code: problem.code,
  changed,
  problem,
});

const recoveryNotification = (problem: DiagnosticProblem): Extract<
  DiagnosticNotification,
  { readonly kind: "recovery" }
> => ({
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

    const active = hasActiveDiagnostic(state) ? state.active : undefined;
    const sameAsActive = sameDiagnosticProblem(active, problem);
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
      ? problemNotification(problem, active !== undefined && !sameAsActive)
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

  const active = hasActiveDiagnostic(state) ? state.active : undefined;
  const shouldNotify = active !== undefined && state.activeWasNotified;
  const notification =
    shouldNotify && active !== undefined ? recoveryNotification(active) : undefined;
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
