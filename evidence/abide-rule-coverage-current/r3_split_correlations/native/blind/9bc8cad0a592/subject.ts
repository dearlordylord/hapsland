export type CaseState = {
  displayLabel: string;
} & (
  | { red?: never; green?: never; blue?: never }
  | { red: number; green: number; blue: number }
);
