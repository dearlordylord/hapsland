import type { DeliveryStatus } from "./support";
export type Receipt = { state: DeliveryStatus; deliveredAt?: Date };
