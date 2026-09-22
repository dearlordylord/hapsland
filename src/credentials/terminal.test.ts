import { describe, expect, it } from "vitest";
import { terminalModeArguments } from "./terminal.ts";

describe("terminal mode arguments", () => {
  it("uses the GNU device flag on Linux", () => {
    expect(terminalModeArguments("linux", "-g")).toEqual(["-F", "/dev/tty", "-g"]);
    expect(terminalModeArguments("linux", "-echo")).toEqual(["-F", "/dev/tty", "-echo"]);
  });

  it("uses the BSD device flag on macOS", () => {
    expect(terminalModeArguments("darwin", "-g")).toEqual(["-f", "/dev/tty", "-g"]);
    expect(terminalModeArguments("darwin", "-echo")).toEqual(["-f", "/dev/tty", "-echo"]);
  });
});
