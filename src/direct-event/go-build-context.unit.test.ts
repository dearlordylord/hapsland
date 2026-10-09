import { describe, expect, it } from "vitest"
import {
  evaluateGoBuildExpression,
  freezeGoBuildSnapshot,
  goFileMembership,
  goFilenameMembership
} from "@hapsland/source-analysis/direct-event/languages/go-build-context"
const linux = freezeGoBuildSnapshot({ goos: "linux", goarch: "arm64", tags: ["paid"] })
describe("declared Go build authority", () => {
  it("keeps the complete target/tag facts frozen with canonical identity", () => {
    const tags = ["paid", "demo", "paid"]
    const first = freezeGoBuildSnapshot({ goos: "linux", goarch: "arm64", tags })
    tags.push("after")
    expect(first.tags).toEqual(["demo", "paid"])
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.tags)).toBe(true)
    expect(first.fingerprint).toBe(
      freezeGoBuildSnapshot({ goos: "linux", goarch: "arm64", tags: ["demo", "paid"] }).fingerprint
    )
    expect(first.fingerprint).not.toBe(linux.fingerprint)
  })
  it("rejects invalid targets and user tags that would replace derived facts", () => {
    for (const tags of [["linux"], ["cgo"], ["go1.27"], ["arm64.v8.0"], ["foo bar"], Array(65).fill("paid")])
      expect(() => freezeGoBuildSnapshot({ goos: "linux", goarch: "arm64", tags })).toThrow()
    expect(() => freezeGoBuildSnapshot({ goos: "host", goarch: "arm64", tags: [] })).toThrow()
  })
  it("evaluates precedence and explicit positive and negative user facts", () => {
    for (const [expression, expected] of [
      ["paid && linux && arm64", "active"],
      ["darwin || linux && !free", "active"],
      ["(darwin || linux) && free", "inactive"],
      ["!paid", "inactive"],
      ["!!paid", "active"]
    ])
      expect(evaluateGoBuildExpression(expression!, linux)).toBe(expected)
    expect(evaluateGoBuildExpression("linux || !linux")).toBe("unknown")
  })
  it("preserves unknown unsupported facts even under otherwise decisive branches", () => {
    for (const expression of [
      "linux || cgo",
      "darwin && go1.27",
      "!goexperiment.rangefunc",
      "amd64.v3",
      "gc",
      "gccgo",
      "linux &&",
      "linux darwin",
      "(linux",
      "x".repeat(4097),
      "!".repeat(40) + "linux"
    ])
      expect(evaluateGoBuildExpression(expression, linux)).toBe("unknown")
  })
  it("selects suffix variants and OS aliases without using host settings", () => {
    expect(goFilenameMembership("model_linux_arm64.go", linux)).toBe("active")
    expect(goFilenameMembership("model_windows.go", linux)).toBe("inactive")
    expect(goFilenameMembership("model_linux.go")).toBe("unknown")
    expect(goFilenameMembership("linux.go")).toBe("active")
    for (const [target, alias] of [
      ["android", "linux"],
      ["ios", "darwin"],
      ["illumos", "solaris"]
    ]) {
      const snapshot = freezeGoBuildSnapshot({ goos: target!, goarch: "arm64", tags: [] })
      expect(goFilenameMembership(`model_${alias}.go`, snapshot)).toBe("active")
      expect(evaluateGoBuildExpression(`${target} && ${alias} && unix`, snapshot)).toBe("active")
    }
    for (const name of ["_model.go", ".model.go", "model_test.go"])
      expect(goFilenameMembership(name, linux)).toBe("inactive")
  })
  it("requires context only when membership actually has constraints", () => {
    expect(goFileMembership("model.go", "// model\npackage p\ntype T int")).toBe("active")
    expect(goFileMembership("model.go", "//go:build paid\n\npackage p\n", linux)).toBe("active")
    expect(goFileMembership("model.go", "//go:build paid\n\npackage p\n")).toBe("unknown")
    for (const header of ["// +build linux\n", "//go:build linux\n//go:build arm64\n", "/* header */\n"])
      expect(goFileMembership("model.go", `${header}package p\n`, linux)).toBe("unknown")
  })
})
