export const sharedRuntimeBundle = (text) => `delete process.env.BUN_BE_BUN;\n${text.replace(/^#![^\n]*(?:\n|$)/u, "")}`

export function sharedRuntimeLauncher(command) {
  if (!/^hapsland-(?:doctor|hook|parser|resident)$/u.test(command)) throw new Error("Invalid shared runtime command")
  return `#!/bin/sh\nset -eu\ndirectory=$(CDPATH= cd "$(dirname "$0")" && pwd -P)\nBUN_BE_BUN=1 exec "$directory/hapsland" --no-install --no-env-file --config=/dev/null "$directory/${command}.js" "$@"\n`
}
