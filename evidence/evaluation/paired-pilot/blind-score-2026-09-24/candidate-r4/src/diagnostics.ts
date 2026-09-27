import type { DiagnosticCode, TraceTapeDiagnostic } from "./types.js";

export function diagnostic(
  lineNumber: number,
  code: DiagnosticCode,
  message: string,
): TraceTapeDiagnostic {
  return { lineNumber, code, message };
}
