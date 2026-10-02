import type { Money } from "./support";
export type CaseState =
  | { displayLabel: string; amountDue: Money & { currency: "EUR" }; invoiceCurrency: "EUR" }
  | { displayLabel: string; amountDue: Money & { currency: "USD" }; invoiceCurrency: "USD" };
