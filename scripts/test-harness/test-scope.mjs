// Optional developer products have explicit test entrypoints. Focused selection
// still accepts them; ordinary and coverage runs select production tests only.
export const isOptionalDevelopmentTest = (path) => {
  const normalized = path.replaceAll("\\", "/")
  return (
    ["src/canonical/session-port.test.ts", "packages/agent-flow-viz/src/permit-dashboard.test.ts"].includes(
      normalized
    ) ||
    normalized.startsWith("packages/monkey-business/") ||
    /^scripts\/game-.*\.test\.mts$/u.test(normalized)
  )
}

export const testDiscovery = (selectedFiles, nodeTestFiles = []) => ({
  include: selectedFiles ?? ["src/**/*.test.ts", "scripts/**/*.test.mts"],
  exclude: [
    "vendor/**",
    "node_modules/**",
    ...nodeTestFiles.map((file) => file.replaceAll("\\", "/")),
    ...(selectedFiles === undefined
      ? ["scripts/game-*.test.mts", "packages/monkey-business/**", "src/canonical/session-port.test.ts"]
      : [])
  ]
})
