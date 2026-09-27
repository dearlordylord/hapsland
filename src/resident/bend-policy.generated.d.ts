export type BendList<T> = { readonly $: "Nil" } |
  { readonly $: "Con"; readonly head: T; readonly tail: BendList<T> };

export type BendSelection = {
  readonly $: "Selection";
  readonly partition: bigint;
  readonly round: bigint;
  readonly snapshot: bigint;
  readonly credential: bigint;
  readonly selected: BendList<bigint>;
  readonly retained: BendList<bigint>;
  readonly findings: bigint;
  readonly bytes: bigint;
};

export type BendAdvice = {
  readonly $: "Advice";
  readonly id: number | bigint;
  readonly unit: number | bigint;
  readonly partition: number | bigint;
  readonly round: number | bigint;
  readonly snapshot: number | bigint;
  readonly credential: number | bigint;
  readonly age_ms: number | bigint;
  readonly solo_bytes: number | bigint;
  readonly collection_ready: boolean;
};

export type BendSelectionResult =
  | { readonly $: "Selected" | "Retained" | "Expired" | "Duplicate"; readonly state: BendSelection }
  | { readonly $: "Limited"; readonly state: BendSelection; readonly id: bigint };

export function bendSelectionInitial(
  partition: number | bigint, round: number | bigint,
  snapshot: number | bigint, credential: number | bigint,
): BendSelection;
export function bendSelectionStep(
  state: BendSelection, advice: BendAdvice, prospectiveBytes: number | bigint,
): BendSelectionResult;
export function bendFitsBatch(items: number | bigint, bytes: number | bigint): boolean;
