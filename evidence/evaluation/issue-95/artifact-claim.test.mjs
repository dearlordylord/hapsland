import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { claimOutputRoot, retryOutputRoot } from "./artifact-claim.mjs";

test("claims a new output directory exactly once", async () => {
  const parent = mkdtempSync(join(tmpdir(), "hapsland-95-artifact-test-"));
  try {
    const target = join(parent, "fresh-pair-1-A");
    await claimOutputRoot(target);
    await assert.rejects(claimOutputRoot(target), { code: "EEXIST" });
    const retry = retryOutputRoot(target);
    assert.equal(retry, `${target}-retry-1`);
    await claimOutputRoot(retry);
    await assert.rejects(claimOutputRoot(retry), { code: "EEXIST" });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
