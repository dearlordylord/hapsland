import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const files = ["DefenseMotionTypes.bend", "DefensePresentation.bend", "PresentationLAWS.bend", "PresentationPROOF.bend"];
const sources = new Map(files.map(file => [file, readFileSync(new URL(file, import.meta.url), "utf8")]));
const mutants = [
  ["unfinished travel disappears", "case True{} _: True{}", "case True{} _: False{}"],
  ["silent parent wait", "case False{} _ _ _: 1", "case False{} _ _ _: 0"],
  ["playback called retained", "case True{} True{} True{} _: 0", "case True{} True{} True{} _: 3"],
  ["certain send invents finish acknowledgement", "case 10: 0", "case 10: 3"],
  ["uncertain send invents finish acknowledgement", "case 11: 0", "case 11: 3"],
  ["erased causal parent", "t,owner,shown,cause,True{}", "t,[],shown,cause,True{}"],
  ["released child waits again", "released,[],owner", "released,owner,owner"],
  ["early terminal appearance", "case _: False{}", "case _: True{}"],
  ["lingering handoff ghost", "case False{} True{}: False{}", "case False{} True{}: timer_live"],
  ["silent spatial queue", "case True{} False{} _ _: 2", "case True{} False{} _ _: 0"],
  ["retention called travel", "case True{} True{} False{} True{}: 3", "case True{} True{} False{} True{}: 0"],
  ["retirement erases acknowledged delivery", "case other: other", "case other: 0"],
  ["movement invents clear", "t,owner,shown,cause,True{}", "t,owner,shown,2,True{}"],
];
function check(replacement, verdict = false) {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-game-proof-"));
  try {
    for (const [file, original] of sources) {
      let contents = original;
      if (file === "DefensePresentation.bend" && replacement) {
        const [before, after] = replacement;
        assert.equal(original.split(before).length, 2, "mutation must have exactly one target");
        contents = original.replace(before, after);
      }
      writeFileSync(join(directory, file), contents);
    }
    return spawnSync("bend", [join(directory, "PresentationPROOF.bend"), ...(verdict ? ["--verdict"] : [])], { encoding: "utf8", timeout: 5000 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
test("approved presentation proofs pass both Bend and the mathematical kernel", () => {
  const result = check(undefined, true);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /ALL PROOFS CHECK/);
});
for (const [name, before, after] of mutants) {
  test(`presentation proof rejects ${name}`, () => {
    const result = check([before, after]);
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /SOME PROOFS FAIL/);
  });
}
