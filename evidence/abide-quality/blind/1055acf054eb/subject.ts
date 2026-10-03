import type { Money } from "./support";

type AmountDueFor<Currency extends Money["currency"]> = Omit<Money, "currency"> & { currency: Currency };
type CaseStateFor<Currency extends Money["currency"]> = {
  displayLabel: string;
  amountDue: AmountDueFor<Currency>;
  invoiceCurrency: Currency;
};

export type CaseState = {
  [Currency in Money["currency"]]: CaseStateFor<Currency>;
}[Money["currency"]];
