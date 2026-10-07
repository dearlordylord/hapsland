import { describe, expect, it } from "vitest"
import { terminalModeArguments, terminalModesEquivalent } from "@hapsland/administration/credentials/terminal"

describe("terminal mode arguments", () => {
  it("uses the GNU device flag on Linux", () => {
    expect(terminalModeArguments("linux", "-g")).toEqual(["-F", "/dev/tty", "-g"])
    expect(terminalModeArguments("linux", "-echo")).toEqual(["-F", "/dev/tty", "-echo"])
  })

  it("uses the BSD device flag on macOS", () => {
    expect(terminalModeArguments("darwin", "-g")).toEqual(["-f", "/dev/tty", "-g"])
    expect(terminalModeArguments("darwin", "-echo")).toEqual(["-f", "/dev/tty", "-echo"])
  })
})

describe("terminal restoration", () => {
  const mode = "gfmt1:cflag=4b00:iflag=2b02:lflag=5cb:oflag=3:erase=7f:ispeed=9600:ospeed=9600"
  it("permits Darwin's pending-input state without permitting changes to terminal settings", () => {
    expect(terminalModesEquivalent("darwin", mode, mode.replace("lflag=5cb", "lflag=200005cb"))).toBe(true)
    for (const changed of [
      mode.replace("lflag=5cb", "lflag=200005c3"),
      mode.replace("iflag=2b02", "iflag=2800"),
      mode.replace("erase=7f", "erase=08"),
      mode.replace("ispeed=9600", "ispeed=4800")
    ])
      expect(terminalModesEquivalent("darwin", mode, changed)).toBe(false)
  })
  it("retains exact comparison on Linux and rejects missing original settings", () => {
    expect(terminalModesEquivalent("linux", "1:2:3:4", "1:2:3:4")).toBe(true)
    expect(terminalModesEquivalent("linux", "1:2:3:4", "1:2:3:20000004")).toBe(false)
    expect(terminalModesEquivalent("darwin", "", "")).toBe(false)
  })
})
