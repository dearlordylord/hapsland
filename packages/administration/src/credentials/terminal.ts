export const terminalModeArguments = (
  operatingSystem: NodeJS.Platform,
  ...arguments_: ReadonlyArray<string>
): ReadonlyArray<string> => [operatingSystem === "darwin" ? "-f" : "-F", "/dev/tty", ...arguments_]

// Darwin PENDIN is kernel input-processing state, not a terminal setting.
// XNU sets it when restoring ICANON and retains it until the next input query.
// Compare every setting while permitting only that documented transient bit.
export const terminalModesEquivalent = (platform: NodeJS.Platform, before: string, after: string): boolean => {
  const settings = (mode: string) =>
    platform === "darwin"
      ? mode.replace(
          /lflag=([0-9a-f]+)/u,
          (_, flags: string) => `lflag=${(BigInt(`0x${flags}`) & ~0x20000000n).toString(16)}`
        )
      : mode
  return before.length > 0 && settings(before) === settings(after)
}
