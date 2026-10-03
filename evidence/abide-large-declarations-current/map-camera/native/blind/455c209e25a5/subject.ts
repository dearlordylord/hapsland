/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */
export interface CaseState {
  displayLabel: string;
  centerLatitude?: number;
  centerLongitude?: number;
}
