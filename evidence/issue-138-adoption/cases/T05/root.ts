export type Receipt = { state: "pending" } | { state: "delivered"; deliveredAt: Date };
