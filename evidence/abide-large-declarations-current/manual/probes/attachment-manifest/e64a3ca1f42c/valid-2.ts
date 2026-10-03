import type { CaseState } from "../../../../attachment-manifest/native/blind/e64a3ca1f42c/subject";
const value = {"displayLabel":"Documents","attachments":[{"filename":"unusual 🧾.pdf","mediaType":"application/pdf"},{"filename":"diagram.png","mediaType":"image/png"}]} as const;
const state: CaseState = value;
export const actualLength = state.attachments.length;
