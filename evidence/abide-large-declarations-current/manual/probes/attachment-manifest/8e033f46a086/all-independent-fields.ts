import type { CaseState } from "../../../../attachment-manifest/native/blind/8e033f46a086/subject";
type Expected = {
displayLabel: string;
attachments: readonly { filename: string; mediaType: "image/png" | "application/pdf" }[];
};
declare const actual: CaseState;
const forward: Expected = actual;
declare const expected: Expected;
const backward: Pick<CaseState, keyof Expected> = expected;
