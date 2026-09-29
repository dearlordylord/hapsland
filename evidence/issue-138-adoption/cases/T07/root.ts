type Status = { state: "pending" } | { state: "delivered"; deliveredAt: Date };
export type Receipt = Status;
