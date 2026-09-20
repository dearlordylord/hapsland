import { describe, expect, it } from "@effect/vitest";
import {
  healthyDiagnosticEvent,
  eventFromOutcomeCodes,
  makeDiagnosticScope,
  problemDiagnosticEvent,
  type DiagnosticScope,
  initialDiagnosticState,
} from "./domain.ts";
import { reduceDiagnostic } from "./reducer.ts";

const scope: DiagnosticScope = {
  sessionId: "session-1",
  repository: "repo-1",
  backend: "jev",
};

const credentials = {
  code: "missing_credentials" as const,
  identity: "missing-credentials",
};

const outage = {
  code: "backend_outage" as const,
  identity: "backend-unavailable",
};

describe("diagnostic reducer", () => {
  it("announces a problem once, suppresses repeats, then announces recovery once", () => {
    const first = reduceDiagnostic(
      initialDiagnosticState,
      problemDiagnosticEvent(scope, credentials),
    );
    expect(first.observation).toMatchObject({
      status: "problem",
      suppressed: false,
      notification: { kind: "problem", changed: false },
    });

    const repeated = reduceDiagnostic(
      first.state,
      problemDiagnosticEvent(scope, credentials),
    );
    expect(repeated.observation).toMatchObject({
      status: "problem",
      suppressed: true,
    });
    expect(repeated.observation.notification).toBeUndefined();

    const recovered = reduceDiagnostic(
      repeated.state,
      healthyDiagnosticEvent(scope),
    );
    expect(recovered.observation).toMatchObject({
      status: "healthy",
      suppressed: false,
      notification: { kind: "recovery", code: "recovery" },
    });

    const quiet = reduceDiagnostic(
      recovered.state,
      healthyDiagnosticEvent(scope),
    );
    expect(quiet.observation).toMatchObject({
      status: "healthy",
      suppressed: false,
    });
    expect(quiet.observation.notification).toBeUndefined();
  });

  it("announces a newly changed problem and keeps outcomes independent of notices", () => {
    const first = reduceDiagnostic(
      initialDiagnosticState,
      problemDiagnosticEvent(scope, credentials),
    );
    const changed = reduceDiagnostic(
      first.state,
      problemDiagnosticEvent(scope, outage),
    );
    expect(changed.observation).toMatchObject({
      status: "problem",
      problem: outage,
      suppressed: false,
      notification: { kind: "problem", changed: true, code: "backend_outage" },
    });

    const changedRepeat = reduceDiagnostic(
      changed.state,
      problemDiagnosticEvent(scope, outage),
    );
    expect(changedRepeat.observation.status).toBe("problem");
    expect(changedRepeat.observation.suppressed).toBe(true);
    expect(changedRepeat.observation.problem).toEqual(outage);

    const recovered = reduceDiagnostic(
      changedRepeat.state,
      healthyDiagnosticEvent(scope),
    );
    expect(recovered.observation.status).toBe("healthy");
    expect(recovered.observation.notification?.kind).toBe("recovery");
  });

  it("keeps independent scopes independent", () => {
    const secondScope = { ...scope, sessionId: "session-2" };
    const first = reduceDiagnostic(
      initialDiagnosticState,
      problemDiagnosticEvent(scope, credentials),
    );
    const second = reduceDiagnostic(
      initialDiagnosticState,
      problemDiagnosticEvent(secondScope, credentials),
    );
    expect(first.observation.notification).toBeDefined();
    expect(second.observation.notification).toBeDefined();
  });

  it("collapses per-file failures deterministically without exposing repository identity", () => {
    const hashedScope = makeDiagnosticScope(
      "session-secret-sentinel",
      "/private/source/SECRET_SENTINEL",
      "jev",
    );
    expect(hashedScope.repository).not.toContain("SECRET_SENTINEL");
    expect(
      eventFromOutcomeCodes(hashedScope, ["review_timeout", "missing_credentials"]),
    ).toEqual({
      scope: hashedScope,
      status: "problem",
      problem: { code: "missing_credentials", identity: "missing-credentials" },
    });
    expect(eventFromOutcomeCodes(hashedScope, ["excluded"])).toEqual({
      scope: hashedScope,
      status: "healthy",
    });
  });
});
