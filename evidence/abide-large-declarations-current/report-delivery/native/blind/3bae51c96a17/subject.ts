/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */
export interface CaseState {
  displayLabel: string;
  deliveryMode: "download" | "email";
  recipients?: readonly [string, ...string[]];
}
