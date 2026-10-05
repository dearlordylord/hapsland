import type { CaseState } from "../../../../attachment-manifest/native/blind/c5555b92e4d6/subject";
const value = {"displayLabel":"Documents","attachments":[{"filename":"report.pdf","mediaType":"application/pdf"}],"attachmentCount":1} as const;
const state: CaseState = value;
export const actualLength = state.attachments.length;
