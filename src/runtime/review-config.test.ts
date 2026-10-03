import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { afterEach, expect, it, vi } from "vitest";
import { loadReviewSettings } from "./review-config.ts";

const compiler = vi.hoisted(() => ({ compileRules: vi.fn() }));
vi.mock("../rules/compiler.ts", async (original) => ({
  ...(await original<typeof import("../rules/compiler.ts")>()),
  compileRules: compiler.compileRules,
}));
const roots: string[] = [];
afterEach(() => {
  compiler.compileRules.mockReset();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it.each([
  {
    cause: { source: "pack.jsonc", field: "rules[0]", reason: "invalid target" },
    source: "pack.jsonc",
    field: "rules[0]",
    reason: "invalid target",
  },
  { cause: { source: 7, field: null, reason: undefined }, source: "7", field: "null", reason: "undefined" },
  { cause: new Error("internal"), source: undefined, field: "ruleOverrides", reason: "rule-pack compilation failed" },
  { cause: null, source: undefined, field: "ruleOverrides", reason: "rule-pack compilation failed" },
  { cause: "internal", source: undefined, field: "ruleOverrides", reason: "rule-pack compilation failed" },
])(
  "preserves compilation diagnostics and supplies missing fields: $cause",
  async ({ cause, source, field, reason }) => {
    const root = mkdtempSync(join(tmpdir(), "hapsland-compilation-error-"));
    roots.push(root);
    compiler.compileRules.mockImplementation(() => {
      throw cause;
    });
    const result = await Effect.runPromise(
      loadReviewSettings(root, { userConfigPath: join(root, "absent.jsonc") }).pipe(Effect.result),
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "ReviewConfigError", source: source ?? root, field, reason },
    });
  },
);
