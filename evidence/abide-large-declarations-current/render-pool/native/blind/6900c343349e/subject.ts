/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */
export interface CaseState {
  displayLabel: string;
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
