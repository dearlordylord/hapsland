import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { LOGIC_IDENTITY, PREPARATION_IDENTITY } from "./index.ts";

it("replay names the exact shared engine and its consumed implementation", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../monkey-business-bend/generated.json", import.meta.url), "utf8"));
  expect(LOGIC_IDENTITY).toBe(`shared-monkey-business-source-sha256:${manifest.identityHash}`);
});

it("replay names the exact import reducer and preparation composition", () => {
  const digest = createHash("sha256");
  for (const path of ["../../../src/canonical/import-graph.generated.js", "./preparation.ts", "./file-trees.ts"])
    digest.update(readFileSync(new URL(path, import.meta.url)));
  expect(PREPARATION_IDENTITY).toBe(`import-preparation-sha256:${digest.digest("hex")}`);
});
