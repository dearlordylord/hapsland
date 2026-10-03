import type { CaseState } from "../../../../attachment-manifest/native/blind/a8f56b4a4bd2/subject";
const value = {"displayLabel":"Documents","attachments":[{"filename":"report.pdf","mediaType":"application/pdf"}]} as const;
const state: CaseState = value;
export const actualLength = state.attachments.length;
