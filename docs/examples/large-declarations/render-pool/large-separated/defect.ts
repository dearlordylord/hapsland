/**
 * Synthetic defect input: The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size.
 * large-separated layout. This file is an input, not a claimed reviewer result.
 * Owner: scripts/abide-large-declaration-fixtures.mjs; review when its fixtures change.
 */
/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */
export interface CaseState {
  label: string;
  quality: "draft" | "final";
  colorMode: "rgb" | "monochrome";
  includeBleed: boolean;
  fontFamilies: readonly string[];
  locale: "en" | "de";
  pageLayout: "portrait" | "landscape";
  compression: "none" | "gzip";
  watermark: string;
  description: string;
  outputFormat: "png" | "pdf";

  workerCount: number;
}
