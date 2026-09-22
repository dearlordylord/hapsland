import type { CodexDirectEventOutput } from "./pipeline.ts";

export type HostOutputAttempt = {
  readonly status: "attempted-unacknowledged";
  readonly encodedBytes: number;
};

/**
 * The attempted state is constructed only after invoking the controlled host
 * writer. Codex exposes no acknowledgement of subsequent model visibility.
 */
export const attemptCodexHostOutput = (
  output: CodexDirectEventOutput,
  write: (encoded: string) => void,
): HostOutputAttempt => {
  const encoded = `${JSON.stringify(output)}\n`;
  write(encoded);
  return {
    status: "attempted-unacknowledged",
    encodedBytes: Buffer.byteLength(encoded, "utf8"),
  };
};
