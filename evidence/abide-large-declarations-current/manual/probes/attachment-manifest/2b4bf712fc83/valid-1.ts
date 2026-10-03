import type { CaseState } from "../../../../attachment-manifest/native/blind/2b4bf712fc83/subject";
const value = {"displayLabel":"Documents","attachments":[{"filename":"report.pdf","mediaType":"application/pdf"}]} as const;
const state: CaseState = value;
export const actualLength = state.attachments.length;
