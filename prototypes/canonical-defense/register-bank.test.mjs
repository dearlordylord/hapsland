import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { lowerHostRegisterBank } from "./register-bank.mjs"

function fixture(words) {
  return `
#include <stdio.h>
#include <pthread.h>
typedef unsigned long long Term;
typedef unsigned int u32;
typedef struct { Term bias; } Env;
#define DEV
#define DEVICE 0
#define WL_BANK Term ${words.join(", ")};
#define WL_SIG Env e, DEV Term* sp, u32 seq, u32 rn, ${words.map((word) => `Term ${word}`).join(", ")}
#define WL_ALL e, sp, seq, rn, ${words.join(", ")}
#define WL_CASE(F) static Term WL_##F(WL_SIG)
#define WL_OPEN    { WL_BANK u32 rn;
#if !DEVICE
#undef  WL_SPIN
WL_CASE(FID_FINISH);
WL_CASE(FID_ENTER) {
  Term saved[] = { ${words.join(", ")} };
  WL_OPEN
  ${words.map((word, index) => `${word} = saved[${index === 0 ? 1 : index === 1 ? 0 : index}];`).join("\n")}
  __attribute__((musttail)) return WL_FID_FINISH(WL_ALL);
}}
WL_CASE(FID_FINISH) {
  Term result = r0 + 3 * r1 + e.bias ${words.slice(2).map((word) => `+ ${word}`).join(" ")};
  WL_OPEN
  return result;
}}
static Term work_loop(Env e, Term* sp, Term t, u32 seq) {
  WL_BANK
  u32 rn = 0;
  ${words.map((word, index) => `${word} = ${index + 1};`).join("\n")}
  return WL_FID_ENTER(WL_ALL);
}
static void* worker(void* data) {
  Term* result = data; Env e = { *result }; Term stack[4];
  for (int i=0; i<1000; i++) *result = work_loop(e, stack, 0, 0);
  return 0;
}
int main(void) {
  Term results[2] = {5,9}; pthread_t threads[2];
  for (int i=0; i<2; i++) pthread_create(&threads[i], 0, worker, &results[i]);
  for (int i=0; i<2; i++) pthread_join(threads[i], 0);
  printf("%llu %llu\\n", results[0], results[1]);
}
#endif
`
}

for (const words of [["r0", "r1"], ["r0", "r1", "r2", "r3", "r4", "r5", "rp", "r6", "r7"]]) {
  test(`register bank preserves captured inputs, musttail and independent worker storage (${words.length} words)`, () => {
    const directory = mkdtempSync(join(tmpdir(), "hapsland-register-bank-"))
    try {
      const original = fixture(words), lowered = lowerHostRegisterBank(original)
      assert.equal(lowered.words, words.length)
      const outputs = []
      for (const [label, source] of [["original", original], ["bank", lowered.source]]) {
        const c = join(directory, `${label}.c`), binary = join(directory, label)
        writeFileSync(c, source)
        const compiled = spawnSync("clang", ["-O0", "-Wno-unused-value", c, "-o", binary, "-pthread"], { encoding: "utf8", timeout: 30000 })
        assert.equal(compiled.error, undefined)
        assert.equal(compiled.status, 0, compiled.stderr)
        const result = spawnSync(binary, [], { encoding: "utf8", timeout: 5000 })
        assert.equal(result.error, undefined)
        assert.equal(result.status, 0, result.stderr)
        outputs.push(result.stdout.trim())
      }
      const sum = words.slice(2).reduce((total, _, index) => total + index + 3, 0)
      assert.deepEqual(outputs, [`${10 + sum} ${14 + sum}`, `${10 + sum} ${14 + sum}`])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
}

test("unknown register layouts and repeated lowering are refused", () => {
  const original = fixture(["r0", "r1"])
  for (const source of [
    original.replace("#define WL_BANK Term r0, r1;", "#define WL_BANK Term r0, r9;"),
    original.replace("#define WL_ALL e, sp, seq, rn, r0, r1", "#define WL_ALL e, sp, seq, rn, r1, r0"),
    original.replace("#undef  WL_SPIN", "#undef WL_SPIN"),
    original + "\n#define WL_BANK Term r0, r1;",
    original + "\n// hapsland_register_bank collision",
    lowerHostRegisterBank(original).source
  ]) assert.throws(() => lowerHostRegisterBank(source), /Unsupported|collision|already/u)
})
