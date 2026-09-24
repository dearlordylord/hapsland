import { instantMilliseconds } from "./instant.js";
import type { RunSummary, TraceTapeDocument } from "./types.js";

/** Count accepted case outcomes and calculate run time when both instants are valid. */
export function summarizeRun(document: TraceTapeDocument): RunSummary {
  const countsByStatus = { pass: 0, fail: 0, skip: 0 };
  for (const testCase of document.cases) {
    if (testCase.end) countsByStatus[testCase.end.status] += 1;
  }

  const startedAt = document.run ? instantMilliseconds(document.run.startedAt) : undefined;
  const finishedAt = document.done ? instantMilliseconds(document.done.finishedAt) : undefined;

  return {
    caseCount: document.cases.length,
    countsByStatus,
    elapsedMs:
      startedAt !== undefined && finishedAt !== undefined
        ? finishedAt - startedAt
        : undefined,
  };
}
