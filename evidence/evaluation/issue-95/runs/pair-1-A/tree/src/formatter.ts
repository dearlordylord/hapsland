import type { TraceTapeDocument, TraceTapeRecord } from "./types.js";

function formatRecord(record: TraceTapeRecord): string {
  switch (record.type) {
    case "RUN":
      return `RUN|${record.runId}|${record.startedAt}`;
    case "CASE":
      return `CASE|${record.caseId}|${record.suite}|${record.name}`;
    case "BEGIN":
      return `BEGIN|${record.caseId}|${record.startedAt}`;
    case "LOG":
      return `LOG|${record.caseId}|${record.level}|${record.message}`;
    case "END":
      return `END|${record.caseId}|${record.status}|${record.durationMs}|${record.detail}`;
    case "DONE":
      return `DONE|${record.finishedAt}`;
  }
}

/** Formats accepted records in source order, using canonical separators and no comments. */
export function formatTraceTape(document: TraceTapeDocument): string {
  return document.records.map(formatRecord).join("\n");
}
