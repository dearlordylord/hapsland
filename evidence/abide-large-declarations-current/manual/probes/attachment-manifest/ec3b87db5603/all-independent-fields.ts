import type { CaseState } from "../../../../attachment-manifest/native/blind/ec3b87db5603/subject";
type Expected = {
displayLabel: string;
subject: string;
bodyText: string;
tags: readonly string[];
category: "internal" | "customer";
locale: "en" | "de";
attachments: readonly { filename: string; mediaType: "image/png" | "application/pdf" }[];
showPreview: boolean;
layout: "compact" | "comfortable";
showSender: boolean;
footerText: string;
description: string;
};
declare const actual: CaseState;
const forward: Expected = actual;
declare const expected: Expected;
const backward: Pick<CaseState, keyof Expected> = expected;
