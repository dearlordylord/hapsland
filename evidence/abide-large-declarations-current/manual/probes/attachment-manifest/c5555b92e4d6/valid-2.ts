import type { CaseState } from "../../../../attachment-manifest/native/blind/c5555b92e4d6/subject";
const value = {"displayLabel":"Documents","attachments":[{"filename":"unusual 🧾.pdf","mediaType":"application/pdf"},{"filename":"diagram.png","mediaType":"image/png"}],"attachmentCount":2} as const;
const state: CaseState = value;
export const actualLength = state.attachments.length;
