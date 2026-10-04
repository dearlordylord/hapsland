import { expect, it } from "vitest"
import { xdgProductDirectory } from "./user-paths.ts"

it("uses absolute XDG bases and ignores absent, empty or relative values", () => {
  expect(xdgProductDirectory("/custom/config", "/home/me/.config")).toBe("/custom/config/hapsland")
  for (const base of [undefined, "", "relative", "../other"])
    expect(xdgProductDirectory(base, "/home/me/.config")).toBe("/home/me/.config/hapsland")
})
