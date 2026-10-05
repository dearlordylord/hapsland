import type { CaseState } from "../../../../attachment-manifest/native/blind/e64a3ca1f42c/subject";
type Expected = {
displayLabel: string;
attachments: readonly { filename: string; mediaType: "image/png" | "application/pdf" }[];
};
declare const actual: CaseState;
const forward: Expected = actual;
declare const expected: Expected;
const backward: Pick<CaseState, keyof Expected> = expected;
