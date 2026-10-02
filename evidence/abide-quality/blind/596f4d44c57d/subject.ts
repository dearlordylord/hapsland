import type { Money } from "./support";
export type CaseState = {
  [Currency in Money["currency"]]: {
    displayLabel: string;
    amountDue: Money & { currency: Currency };
    invoiceCurrency: Currency;
  };
}[Money["currency"]];
