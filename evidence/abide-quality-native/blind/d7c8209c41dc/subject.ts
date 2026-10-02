export type CaseState = { displayLabel: string; status: "pending"; note?: string } | { displayLabel: string; status: "paid"; receipt: string; note?: string };
