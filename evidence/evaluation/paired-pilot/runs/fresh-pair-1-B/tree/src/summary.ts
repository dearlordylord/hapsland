import { timestampToEpochMilliseconds } from "./timestamps.js";
import type { CaseStatus, RunSummary, TraceTapeDocument } from "./types.js";

/** Count completed cases by status and compute the run timestamp difference. */
export function summarizeRun(document: TraceTapeDocument): RunSummary {
  const casesByStatus: Record<CaseStatus, number> = {
    pass: 0,
    fail: 0,
    skip: 0,
  };

  for (const testCase of document.cases) {
    if (testCase.end !== undefined) casesByStatus[testCase.end.status] += 1;
  }

  const summary: RunSummary = {
    totalCases: document.cases.length,
    casesByStatus,
  };
  if (document.run !== undefined && document.done !== undefined) {
    const startedAt = timestampToEpochMilliseconds(document.run.startedAt);
    const finishedAt = timestampToEpochMilliseconds(document.done.finishedAt);
    if (startedAt !== undefined && finishedAt !== undefined) {
      summary.elapsedRunTimeMs = finishedAt - startedAt;
    }
  }
  return summary;
}
