export type CaseState = { displayLabel: string; status: "pending"; receipt?: never; note?: string } | { displayLabel: string; status: "paid"; receipt: string; note?: string };
