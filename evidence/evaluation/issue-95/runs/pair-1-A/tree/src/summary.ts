import type { CaseStatus, RunSummary, TraceTapeDocument } from "./types.js";
import { isIsoInstant } from "./validation.js";

export function summarizeRun(document: TraceTapeDocument): RunSummary {
  const byStatus: Record<CaseStatus, number> = { pass: 0, fail: 0, skip: 0 };
  let incompleteCases = 0;
  for (const testCase of document.cases) {
    if (testCase.state === "ended") byStatus[testCase.status] += 1;
    else incompleteCases += 1;
  }

  const run = document.records.find((record) => record.type === "RUN");
  const done = document.records.find((record) => record.type === "DONE");
  const elapsedMs =
    run?.type === "RUN" &&
    done?.type === "DONE" &&
    isIsoInstant(run.startedAt) &&
    isIsoInstant(done.finishedAt)
      ? Date.parse(done.finishedAt) - Date.parse(run.startedAt)
      : undefined;

  return {
    totalCases: document.cases.length,
    byStatus,
    incompleteCases,
    ...(elapsedMs === undefined ? {} : { elapsedMs }),
  };
}
