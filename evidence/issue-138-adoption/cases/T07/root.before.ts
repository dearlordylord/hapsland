type Status = { state: "pending" } | { state: "delivered"; deliveredAt: number };
export type Receipt = { state: string; deliveredAt?: number };
