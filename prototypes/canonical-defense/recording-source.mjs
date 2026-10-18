import assert from "node:assert/strict"

// Native window IO is tested by execution, outside the recording-core proofs.
export const recordingNativeIO = [
  "DefenseRaster.rasterize", "DefenseMain.view", "DefenseMain.loop",
  "DefenseMain.start_loop", "DefenseMain.launch_mode", "DefenseMain.launch",
  "DefenseMain.checked_launch", "DefenseMain.main"
]
export function qualifyRecordingSource(result) {
  assert.ifError(result.error)
  assert.ok(result.signal == null, "Interrupted source checks cannot qualify")
  if (result.status === 0) return { excludedNativeIO: [] }
  const diagnostics = (result.stdout + result.stderr).replace(/\r/g, "")
    .replace(/\nbend [^\n]+ is available: run bend update\n?$/, "\n")
  assert.equal(result.status, 1, diagnostics)
  const expected = "SOME PROOFS FAIL\nError: 8 defs rely on unsafe or foreign code:\n" +
    recordingNativeIO.map(name => `- ${name}\n`).join("")
  assert.equal(diagnostics, expected, "Only the declared native window IO boundary may remain outside source proofs")
  return { excludedNativeIO: [...recordingNativeIO] }
}
