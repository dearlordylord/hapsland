export type SigningState =
  | { state: "draft"; certificate?: never }
  | { state: "signed"; certificate: "alice" | "bob" };
