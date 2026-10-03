/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */
export interface CaseState {
  displayLabel: string;
  format: "csv" | "pdf";
  columns: readonly string[];
  locale: "en" | "de";
  includeHeader: boolean;
  fileStem: string;

  deliveryMode: "download" | "email";

  compression: "none" | "gzip";
  sortOrder: "ascending" | "descending";
  filters: readonly string[];
  description: string;
  footerText: string;

  recipients?: readonly [string, ...string[]];
}
