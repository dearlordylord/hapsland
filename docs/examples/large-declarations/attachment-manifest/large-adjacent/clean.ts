/**
 * Synthetic clean input: The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately.
 * large-adjacent layout. This file is an input, not a claimed reviewer result.
 * Owner: scripts/abide-large-declaration-fixtures.mjs; review when its fixtures change.
 */
/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */
export interface CaseState {
  label: string;
  attachments: readonly { filename: string; mediaType: "image/png" | "application/pdf" }[];

  subject: string;
  bodyText: string;
  tags: readonly string[];
  category: "internal" | "customer";
  locale: "en" | "de";
  showPreview: boolean;
  layout: "compact" | "comfortable";
  showSender: boolean;
  footerText: string;
  description: string;
}
