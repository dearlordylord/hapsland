/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */
export interface CaseState {
  displayLabel: string;
  attachments: readonly { filename: string; mediaType: "image/png" | "application/pdf" }[];
}
