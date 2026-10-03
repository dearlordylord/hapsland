import { Effect } from "effect";
import { expect, it, vi } from "vitest";
import { diagnosePackage } from "./package-diagnostics.ts";
import { analyzeTypeFile } from "../direct-event/analyzer.ts";

vi.mock("../direct-event/analyzer.ts", () => ({ analyzeTypeFile: vi.fn() }));

it.each([
  { cause: Object.assign(new Error("binding failed"), { code: "ERR_DLOPEN_FAILED" }), observed: "load-failed" },
  { cause: new Error("parser failed"), observed: "load-failed" },
  { cause: null, observed: "load-failed" },
  { cause: "parser failed", observed: "load-failed" },
])("reports parser probe failure as unsupported ($observed)", async ({ cause, observed }) => {
  vi.mocked(analyzeTypeFile).mockImplementation(() => {
    throw cause;
  });
  const output = await Effect.runPromise(diagnosePackage());
  expect(output.status).toBe("unsupported");
  expect(output.checks.filter((check) => check.name.startsWith("parser") && !check.name.endsWith("binding"))).toEqual([
    {
      name: "parser",
      status: "unsupported",
      observed,
      required: "packaged TypeScript parser loads and analyzes",
      action: "reinstall a release archive containing compatible parser bindings for this platform",
    },
  ]);
});
