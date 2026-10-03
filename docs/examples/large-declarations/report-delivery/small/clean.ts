/**
 * Synthetic clean input: A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient.
 * small layout. This file is an input, not a claimed reviewer result.
 * Owner: scripts/abide-large-declaration-fixtures.mjs; review when its fixtures change.
 */
/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */
export interface CaseState {
  label: string;
  delivery: { mode: "download"; recipients?: never } | { mode: "email"; recipients: readonly [string, ...string[]] };
}
