/**
 * Synthetic clean input: A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers.
 * large-separated layout. This file is an input, not a claimed reviewer result.
 * Owner: scripts/abide-large-declaration-fixtures.mjs; review when its fixtures change.
 */
/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */
export interface CaseState {
  label: string;
  theme: "light" | "dark";
  showLegend: boolean;
  markerLabels: readonly string[];
  showZoomControls: boolean;
  allowRotation: boolean;
  locale: "en" | "de";
  layerNames: readonly string[];
  showScale: boolean;
  description: string;
  attribution: string;

  center?: { latitude: number; longitude: number };
}
