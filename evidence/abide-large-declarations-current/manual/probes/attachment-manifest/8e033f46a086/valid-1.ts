import type { CaseState } from "../../../../attachment-manifest/native/blind/8e033f46a086/subject";
const value = {"displayLabel":"Documents","attachments":[{"filename":"report.pdf","mediaType":"application/pdf"}],"attachmentCount":1} as const;
const state: CaseState = value;
export const actualLength = state.attachments.length;
