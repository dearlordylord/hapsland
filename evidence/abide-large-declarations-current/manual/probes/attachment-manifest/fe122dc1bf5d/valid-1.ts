import type { CaseState } from "../../../../attachment-manifest/native/blind/fe122dc1bf5d/subject";
const value = {"displayLabel":"Documents","attachments":[{"filename":"report.pdf","mediaType":"application/pdf"}]} as const;
const state: CaseState = value;
export const actualLength = state.attachments.length;
