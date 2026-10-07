import { test } from "node:test"
import assert from "node:assert/strict"
import { nativeDependencyPaths } from "./native-compiler-inputs.mjs"
test("native dependency output includes system headers and continued paths", () => {
  assert.deepEqual(nativeDependencyPaths("hapsland: native/main.c \\\n /usr/include/header.h native/main.c\n"), [
    "/usr/include/header.h",
    "native/main.c"
  ])
})
for (const text of [
  "wrong: native/main.c",
  "hapsland:",
  "hapsland: $(HEADERS)",
  "hapsland: escaped\\ path.h",
  "hapsland: # comment",
  "hapsland: C:/file.h"
])
  test(`rejects unsupported native dependency output ${JSON.stringify(text)}`, () => {
    assert.throws(() => nativeDependencyPaths(text), /native dependency output/)
  })
