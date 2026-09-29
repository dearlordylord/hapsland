type Status = "pending" | "delivered";
export interface Receipt { state: Status; deliveredAt?: Date }
