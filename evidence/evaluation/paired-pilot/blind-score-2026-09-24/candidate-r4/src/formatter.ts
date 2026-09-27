import { parseTraceTape } from "./parser.js";
import type { TraceTapeDocument, TraceTapeRecord } from "./types.js";

/** Format a complete, diagnostics-free document as canonical TraceTape text. */
export function formatTraceTape(document: TraceTapeDocument): string {
  if (document.diagnostics.length > 0) {
    throw new TypeError("Cannot format a document that contains diagnostics.");
  }

  const text = document.records.map(recordToLine).join("\n");
  const parsed = parseTraceTape(text);
  if (parsed.diagnostics.length > 0) {
    throw new TypeError("Cannot format an incomplete or inconsistent TraceTape document.");
  }
  return `${text}\n`;
}

function recordToLine(record: TraceTapeRecord): string {
  switch (record.type) {
    case "RUN":
      return line(["RUN", record.runId, record.startedAt]);
    case "CASE":
      return line(["CASE", record.caseId, record.suite, record.name]);
    case "BEGIN":
      return line(["BEGIN", record.caseId, record.startedAt]);
    case "LOG":
      return line(["LOG", record.caseId, record.level, record.message]);
    case "END":
      return line(["END", record.caseId, record.status, String(record.durationMs), record.detail]);
    case "DONE":
      return line(["DONE", record.finishedAt]);
  }
}

function line(fields: string[]): string {
  for (const field of fields) {
    if (/[|\r\n]/.test(field)) {
      throw new TypeError("TraceTape fields cannot contain pipes or line breaks.");
    }
    if (field !== field.trim()) {
      throw new TypeError("TraceTape fields cannot have leading or trailing whitespace.");
    }
  }
  return fields.join("|");
}
