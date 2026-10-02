import type { Money } from "./support";
type InvoiceCurrency = Money["currency"];

export type CaseState = {
  [Currency in InvoiceCurrency]: {
    displayLabel: string;
    amountDue: Money & { currency: Currency };
    invoiceCurrency: Currency;
  };
}[InvoiceCurrency];
