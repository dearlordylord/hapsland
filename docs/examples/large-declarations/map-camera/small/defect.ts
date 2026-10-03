/**
 * Synthetic defect input: A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers.
 * small layout. This file is an input, not a claimed reviewer result.
 * Owner: scripts/abide-large-declaration-fixtures.mjs; review when its fixtures change.
 */
/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */
export interface CaseState {
  label: string;
  centerLatitude?: number;
  centerLongitude?: number;
}
