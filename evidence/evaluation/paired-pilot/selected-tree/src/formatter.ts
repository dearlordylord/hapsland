import { TraceRecord, TraceTapeDocument } from "./types";
import { parseTraceTape } from "./parser";

/** Format a valid parsed document as canonical TraceTape text. */
export function formatTraceTape(document: TraceTapeDocument): string {
  if (!document.isValid || document.diagnostics.length > 0) {
    throw new TypeError("Cannot format an invalid TraceTape document.");
  }

  const formatted = document.records.map(formatRecord).join("\n") + "\n";
  if (!parseTraceTape(formatted).isValid) {
    throw new TypeError("Document records do not form a valid TraceTape run.");
  }
  return formatted;
}

function formatRecord(record: TraceRecord): string {
  switch (record.type) {
    case "RUN":
      return joinFields([record.type, record.runId, record.startedAt]);
    case "CASE":
      return joinFields([record.type, record.caseId, record.suite, record.name]);
    case "BEGIN":
      return joinFields([record.type, record.caseId, record.startedAt]);
    case "LOG":
      return joinFields([record.type, record.caseId, record.level, record.message]);
    case "END":
      return joinFields([
        record.type,
        record.caseId,
        record.status,
        String(record.durationMs),
        record.detail,
      ]);
    case "DONE":
      return joinFields([record.type, record.finishedAt]);
  }
}

function joinFields(fields: string[]): string {
  for (const field of fields) {
    if (field.includes("|") || /[\r\n]/u.test(field) || field !== field.trim()) {
      throw new TypeError("TraceTape fields cannot contain delimiters, newlines, or edge whitespace.");
    }
  }
  return fields.join("|");
}
