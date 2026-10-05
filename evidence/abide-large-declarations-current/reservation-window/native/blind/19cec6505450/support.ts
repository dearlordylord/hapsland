export interface Clock { now: () => number; }
export function readServiceTime(): number { return Date.now(); }
export interface ReservationRequest {
  reference: string;
  requestedSeats: number;
  remainingSeats: number;
  holdUntil: number;
  temporarilyClosed: boolean;
}
export interface ReservationDecision {
  description: string;
  reference: string;
  status: "closed" | "expired" | "unavailable" | "available";
  seatsAfterBooking: number;
}
