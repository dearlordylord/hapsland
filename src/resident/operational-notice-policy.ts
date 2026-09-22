export type OperationalNoticeAdmission =
  | { readonly action: "suppress"; readonly emit: false }
  | { readonly action: "reject-full"; readonly emit: false }
  | { readonly action: "refresh"; readonly emit: true }
  | { readonly action: "create"; readonly emit: true };

/** Bounded cooldown-table policy, independent of the capacity reservation mechanism. */
export const operationalNoticeAdmission = (input: {
  readonly now: number;
  readonly existingNextAllowedAt: number | undefined;
  readonly keyCount: number;
  readonly maximumKeys: number;
}): OperationalNoticeAdmission => {
  if (input.existingNextAllowedAt !== undefined) {
    return input.now < input.existingNextAllowedAt
      ? { action: "suppress", emit: false }
      : { action: "refresh", emit: true };
  }
  return input.keyCount >= input.maximumKeys
    ? { action: "reject-full", emit: false }
    : { action: "create", emit: true };
};
