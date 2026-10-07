import { test } from "node:test"
import assert from "node:assert/strict"
import { nativeHeaderSearchPaths } from "./native-header-search.mjs"
test("preserves active and missing native include search candidates", () => {
  assert.deepEqual(
    nativeHeaderSearchPaths(
      'ignoring nonexistent directory "/optional"\n#include "..." search starts here:\n#include <...> search starts here:\n /first\n /second\nEnd of search list.\n'
    ),
    ["/optional", "/first", "/second"]
  )
})
for (const text of [
  "",
  '#include "..." search starts here:\n /first\nEnd of search list.',
  '#include "..." search starts here:\n#include <...> search starts here:\n#include <...> search starts here:\n /first\nEnd of search list.',
  '#include "..." search starts here:\n#include <...> search starts here:\n /first\nEnd of search list.\n#include "..." search starts here:',
  "#include <...> search starts here:\n /first\nEnd of search list.",
  '#include "..." search starts here:\n#include <...> search starts here:\n relative\nEnd of search list.',
  '#include "..." search starts here:\n#include <...> search starts here:\n /first'
])
  test("rejects incomplete or unsupported native include profile " + JSON.stringify(text), () =>
    assert.throws(() => nativeHeaderSearchPaths(text), /native include/)
  )
