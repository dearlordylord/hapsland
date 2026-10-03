/**
 * Synthetic clean input: A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient.
 * large-separated layout. This file is an input, not a claimed reviewer result.
 * Owner: scripts/abide-large-declaration-fixtures.mjs; review when its fixtures change.
 */
/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */
export interface CaseState {
  label: string;
  format: "csv" | "pdf";
  columns: readonly string[];
  locale: "en" | "de";
  includeHeader: boolean;
  fileStem: string;
  compression: "none" | "gzip";
  sortOrder: "ascending" | "descending";
  filters: readonly string[];
  description: string;
  footerText: string;

  delivery: { mode: "download"; recipients?: never } | { mode: "email"; recipients: readonly [string, ...string[]] };
}
