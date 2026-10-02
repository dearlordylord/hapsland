export type CaseState =
  | { displayLabel: string; status: "pending"; receipt: null }
  | { displayLabel: string; status: "paid"; receipt: string };
