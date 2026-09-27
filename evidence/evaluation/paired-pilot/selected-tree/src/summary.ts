import { CaseStatus, RunSummary, TraceTapeDocument } from "./types";
import { isIsoInstant } from "./validation";

/** Count accepted END records by status and calculate run elapsed time when possible. */
export function summarizeRun(document: TraceTapeDocument): RunSummary {
  const byStatus: Record<CaseStatus, number> = { pass: 0, fail: 0, skip: 0 };

  for (const testCase of document.cases) {
    if (testCase.end !== null) byStatus[testCase.end.status] += 1;
  }

  const start = document.run?.startedAt;
  const finish = document.done?.finishedAt;
  let elapsedMilliseconds: number | null = null;
  if (start !== undefined && finish !== undefined && isIsoInstant(start) && isIsoInstant(finish)) {
    const startMilliseconds = Date.parse(start);
    const finishMilliseconds = Date.parse(finish);
    if (Number.isFinite(startMilliseconds) && Number.isFinite(finishMilliseconds)) {
      elapsedMilliseconds = finishMilliseconds - startMilliseconds;
    }
  }

  return {
    byStatus,
    totalCases: byStatus.pass + byStatus.fail + byStatus.skip,
    elapsedMilliseconds,
  };
}
