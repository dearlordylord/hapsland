import type { CaseState } from "../../../../attachment-manifest/native/blind/b357885c0378/subject";
type Expected = {
displayLabel: string;
subject: string;
bodyText: string;
tags: readonly string[];
category: "internal" | "customer";
locale: "en" | "de";
showPreview: boolean;
layout: "compact" | "comfortable";
showSender: boolean;
footerText: string;
description: string;
attachments: readonly { filename: string; mediaType: "image/png" | "application/pdf" }[];
};
declare const actual: CaseState;
const forward: Expected = actual;
declare const expected: Expected;
const backward: Pick<CaseState, keyof Expected> = expected;
