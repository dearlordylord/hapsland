export interface CaseState {
  /** An optional RGB color must supply all three channels. A lone red channel is not a color. */
  displayLabel: string;
  red?: number;
  green?: number;
  blue?: number;
}
