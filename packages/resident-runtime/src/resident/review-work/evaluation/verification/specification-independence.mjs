import assert from "node:assert/strict"

export function requireIndependent(source, alias) {
  const code = source.replace(/#[^\n]*/gu, "")
  assert.doesNotMatch(
    code,
    new RegExp("\\b" + alias + "\\.[a-z_][A-Za-z0-9_]*", "u"),
    "Independent public-step specification must determine its own transition; remove the production helper call"
  )
}
