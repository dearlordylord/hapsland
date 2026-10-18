import assert from "node:assert/strict"
import test from "node:test"
import { qualifyRecordingSource, recordingNativeIO } from "./recording-source.mjs"
const expected = "SOME PROOFS FAIL\nError: 8 defs rely on unsafe or foreign code:\n" + recordingNativeIO.map(name => `- ${name}\n`).join("")
test("recording source qualification names the exact native IO exclusion", () => {
  assert.deepEqual(qualifyRecordingSource({status:1,stdout:expected,stderr:""}), {excludedNativeIO:recordingNativeIO})
  assert.deepEqual(qualifyRecordingSource({status:0,stdout:"ALL PROOFS CHECK\n",stderr:""}), {excludedNativeIO:[]})
})
test("additional unsafe code, type errors, interrupted checks and altered exclusions remain failures", () => {
  for (const stdout of [expected+"Error: type mismatch\n", expected.replace("DefenseMain.view","DefenseMain.tick"), expected.replace("DefenseMain.view","DefenseMain.clock_record"), expected.replace("DefenseMain.view","Recording.apply"), expected.replace("DefenseMain.view","DefenseMain.loop"), expected.replace("8 defs","9 defs")+"- DefenseHost.tick\n", "Error: missing name\n"])
    assert.throws(() => qualifyRecordingSource({status:1,stdout,stderr:""}))
  assert.throws(() => qualifyRecordingSource({status:null,stdout:"",stderr:"",error:new Error("timeout")}))
})

test("signals cannot qualify even with expected diagnostics", () => {
  assert.throws(() => qualifyRecordingSource({status:1,stdout:expected,stderr:"",signal:"SIGKILL"}))
})
