export type OperationalNoticeAdmission =
  | { readonly action: "suppress"; readonly emit: false }
  | { readonly action: "reject-full"; readonly emit: false }
  | { readonly action: "refresh"; readonly emit: true }
  | { readonly action: "create"; readonly emit: true };

/** Bounded cooldown-table admission compiled from Bend. */
export const operationalNoticeAdmission = (input: {
  readonly now: number;
  readonly existingNextAllowedAt: number | undefined;
  readonly keyCount: number;
  readonly maximumKeys: number;
}): OperationalNoticeAdmission => {
  const remaining: BendMaybeNat = input.existingNextAllowedAt === undefined
    ? { $: "None" }
    : { $: "Some", value: BigInt(Math.ceil(Math.max(0,
      input.existingNextAllowedAt - input.now))) };
  const decision = bendNoticeDecide(remaining, input.keyCount, input.maximumKeys);
  switch (decision.$) {
    case "Suppress": return { action: "suppress", emit: false };
    case "Refresh": return { action: "refresh", emit: true };
    case "RejectFull": return { action: "reject-full", emit: false };
    case "Create": return { action: "create", emit: true };
  }
};
import { bendNoticeDecide, type BendMaybeNat } from "./bend-policy.generated.js";
