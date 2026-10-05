export const terminalModeArguments = (
  operatingSystem: NodeJS.Platform,
  ...arguments_: ReadonlyArray<string>
): ReadonlyArray<string> => [operatingSystem === "darwin" ? "-f" : "-F", "/dev/tty", ...arguments_]
