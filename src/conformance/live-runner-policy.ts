export const UNKNOWN_PROVIDER_CALL_COUNT = "unknown" as const;
export class PaidExecutionNotAuthorized extends Error {}
/** Must run before credential lookup or any provider-capable command. */
export const assertPaidExecutionAuthorized = (args: ReadonlyArray<string>): void => {
  if (!args.includes("--execute-paid")) throw new PaidExecutionNotAuthorized("paid execution requires --execute-paid");
};
/** Admission is deliberately irrelevant to provider-attempt accounting. */
export const providerCallCountForEvidence = (_admissionAccepted: boolean) =>
  UNKNOWN_PROVIDER_CALL_COUNT;
