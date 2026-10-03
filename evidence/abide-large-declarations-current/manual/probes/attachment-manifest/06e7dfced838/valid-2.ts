import type { CaseState } from "../../../../attachment-manifest/native/blind/06e7dfced838/subject";
const value = {"displayLabel":"Documents","subject":"Monthly update","bodyText":"Contents","tags":["operations"],"category":"internal","locale":"en","showPreview":true,"layout":"compact","showSender":false,"footerText":"End","description":"Shared attachments","attachments":[{"filename":"unusual 🧾.pdf","mediaType":"application/pdf"},{"filename":"diagram.png","mediaType":"image/png"}]} as const;
const state: CaseState = value;
export const actualLength = state.attachments.length;
