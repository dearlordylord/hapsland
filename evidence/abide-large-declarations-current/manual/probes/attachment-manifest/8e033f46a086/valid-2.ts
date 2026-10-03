import type { CaseState } from "../../../../attachment-manifest/native/blind/8e033f46a086/subject";
const value = {"displayLabel":"Documents","attachments":[{"filename":"unusual 🧾.pdf","mediaType":"application/pdf"},{"filename":"diagram.png","mediaType":"image/png"}],"attachmentCount":2} as const;
const state: CaseState = value;
export const actualLength = state.attachments.length;
