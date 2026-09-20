import type { DeliveryStatus, DeliveredAt } from "./domain.ts";

export interface DeliveryEvent {
  status: DeliveryStatus;
  deliveredAt?: DeliveredAt;
  label: string;
}

export type Money = { amount: number; currency: string; note?: string };
