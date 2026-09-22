import type { CodexDirectEventOutput } from "./pipeline.ts";

export const encodedCodexHostOutputBytes = (output: CodexDirectEventOutput): number =>
  Buffer.byteLength(`${JSON.stringify(output)}\n`, "utf8");

export type HostOutputAttempt = {
  readonly status: "attempted-unacknowledged";
  readonly encodedBytes: number;
};

/**
 * The attempted state is constructed only after invoking the controlled host
 * writer. Codex exposes no acknowledgement of subsequent model visibility.
 * Semantic currentness is checked immediately before this boundary; edits that
 * occur after the write begins cannot revoke the already-handed-off bytes, so
 * no post-handoff freshness guarantee is made.
 */
export const attemptCodexHostOutput = (
  output: CodexDirectEventOutput,
  write: (encoded: string) => void,
): HostOutputAttempt => {
  const encoded = `${JSON.stringify(output)}\n`;
  write(encoded);
  return {
    status: "attempted-unacknowledged",
    encodedBytes: encodedCodexHostOutputBytes(output),
  };
};
