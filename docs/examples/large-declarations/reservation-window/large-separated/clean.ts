/**
 * Synthetic clean input: Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved.
 * large-separated layout. This file is an input, not a claimed reviewer result.
 * Owner: scripts/abide-large-declaration-fixtures.mjs; review when its fixtures change.
 */
import { type Clock, type ReservationRequest, type ReservationDecision } from "./support";
/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */
export function CaseState(
  label: string,
  request: ReservationRequest,
  clock: Clock,
): ReservationDecision {
  const description = label.trim();
  const requested = request.requestedSeats;
  const remaining = request.remainingSeats;

  const reference = request.reference;
  const availableSeats = Math.max(0, remaining - requested);
  const observedAt = clock.now();

  const expired = request.holdUntil <= observedAt;
  const unavailable = requested > remaining;

  const status = request.temporarilyClosed ? "closed" : expired ? "expired" : unavailable ? "unavailable" : "available";
  return { description, reference, status, seatsAfterBooking: status === "available" ? availableSeats : remaining };
}
