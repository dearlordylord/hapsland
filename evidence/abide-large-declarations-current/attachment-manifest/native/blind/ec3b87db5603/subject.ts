/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */
export interface CaseState {
  displayLabel: string;
  subject: string;
  bodyText: string;
  tags: readonly string[];
  category: "internal" | "customer";
  locale: "en" | "de";

  attachments: readonly { filename: string; mediaType: "image/png" | "application/pdf" }[];

  showPreview: boolean;
  layout: "compact" | "comfortable";
  showSender: boolean;
  footerText: string;
  description: string;

  attachmentCount: number;
}
