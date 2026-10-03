import type { CaseState } from "../../../../attachment-manifest/native/blind/b357885c0378/subject";
const value = {"displayLabel":"Documents","subject":"Monthly update","bodyText":"Contents","tags":["operations"],"category":"internal","locale":"en","showPreview":true,"layout":"compact","showSender":false,"footerText":"End","description":"Shared attachments","attachments":[{"filename":"report.pdf","mediaType":"application/pdf"}]} as const;
const state: CaseState = value;
export const actualLength = state.attachments.length;
