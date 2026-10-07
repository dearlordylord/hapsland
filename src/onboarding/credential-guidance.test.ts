import { expect, it } from "vitest"
import { credentialSourceGuidance } from "@hapsland/administration/onboarding/credential-guidance"

it.each(["claude", "codex", "pi"] as const)("names the actual source and replacement for %s", (host) => {
  const common = { envVar: "CUSTOM_KEY", provider: "jev", environmentOnly: false }
  const file = credentialSourceGuidance(
    { ...common, source: "environment", file: "/repo/.env.local" },
    host,
    "linux"
  ).join("\n")
  expect(file).toContain("CUSTOM_KEY in /repo/.env.local")
  expect(file).toContain("does not overwrite this file")
  const env = credentialSourceGuidance({ ...common, source: "environment", environmentOnly: true }, host, "linux").join(
    "\n"
  )
  expect(env).toContain("environment variable CUSTOM_KEY")
  expect(env).toContain("saved login is not used")
  const saved = credentialSourceGuidance({ ...common, source: "saved" }, host, "darwin").join("\n")
  expect(saved).toContain("login Keychain")
  expect(saved).toContain(`hapsland setup ${host} --new-key`)
})
