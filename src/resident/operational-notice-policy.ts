import {
  bendNoticeAdvance, bendNoticeDecide,
  type BendMaybeNat, type BendNoticeAdvance,
} from "./bend-policy.generated.js";

export type OperationalNoticeAdmission =
  | { readonly action: "suppress"; readonly emit: false }
  | { readonly action: "reject-full"; readonly emit: false }
  | { readonly action: "refresh"; readonly emit: true }
  | { readonly action: "create"; readonly emit: true };

/** Bounded cooldown-table admission compiled from Bend. */
const remainingForBend = (now: number, existingNextAllowedAt: number | undefined): BendMaybeNat =>
  existingNextAllowedAt === undefined
    ? { $: "None" }
    : { $: "Some", value: BigInt(Math.ceil(Math.max(0, existingNextAllowedAt - now))) };

export const operationalNoticeAdvance = (input: {
  readonly now: number;
  readonly existingNextAllowedAt: number | undefined;
  readonly keyCount: number;
  readonly maximumKeys: number;
  readonly suppressedCount: number;
  readonly pendingSuppressedCount: number | undefined;
  readonly pendingLeased: boolean;
}): BendNoticeAdvance => bendNoticeAdvance(
  remainingForBend(input.now, input.existingNextAllowedAt),
  input.keyCount, input.maximumKeys, input.suppressedCount,
  input.pendingSuppressedCount === undefined
    ? { $: "None" } : { $: "Some", value: BigInt(input.pendingSuppressedCount) },
  input.pendingLeased,
);

export const operationalNoticeAdmission = (input: {
  readonly now: number;
  readonly existingNextAllowedAt: number | undefined;
  readonly keyCount: number;
  readonly maximumKeys: number;
}): OperationalNoticeAdmission => {
  const remaining = remainingForBend(input.now, input.existingNextAllowedAt);
  const decision = bendNoticeDecide(remaining, input.keyCount, input.maximumKeys);
  switch (decision.$) {
    case "Suppress": return { action: "suppress", emit: false };
    case "Refresh": return { action: "refresh", emit: true };
    case "RejectFull": return { action: "reject-full", emit: false };
    case "Create": return { action: "create", emit: true };
  }
};
