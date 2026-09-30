import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { LOGIC_IDENTITY } from "./index.ts";

it("replay names the exact checked canonical Bend artifact", () => {
  const artifact = fileURLToPath(new URL("../../../src/canonical/canonical.generated.js", import.meta.url));
  const header = readFileSync(artifact, "utf8").split("\n", 1)[0];
  expect(LOGIC_IDENTITY).toBe(header?.replace("// hapsland-bend-source-sha256:", "canonical-source-sha256:"));
});
