import type { CaseState } from "../../../../attachment-manifest/native/blind/e64a3ca1f42c/subject";
const value = {"displayLabel":"Documents","attachments":[{"filename":"report.pdf","mediaType":"application/pdf"}]} as const;
const state: CaseState = value;
export const actualLength = state.attachments.length;
