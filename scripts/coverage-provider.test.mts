import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import provider, { mergeCoverageScripts, mergeSourceFunctions } from "./coverage-provider.mjs";

it("adds V8 counters only within compatible execution contexts", () => {
  const scripts = new Map();
  const script = (isExtendedContext: boolean, startOffset: number, count: number) => ({
    scriptId: "1",
    url: "file:///subject.ts",
    isExtendedContext,
    startOffset,
    functions: [{ functionName: "choose", isBlockCoverage: true, ranges: [{ startOffset: 0, endOffset: 100, count }] }],
  });
  mergeCoverageScripts(scripts, { result: [script(false, 0, 2), script(true, 0, 3), script(false, 5, 4)] });
  mergeCoverageScripts(scripts, { result: [script(false, 0, 1)] });
  expect(scripts.size).toBe(3);
  expect([...scripts.values()].map((value) => value.functions[0].ranges[0].count)).toEqual([3, 3, 4]);
});

it("merges source-map aliases by body, then adds counters across execution contexts", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-contexts-"));
  try {
    const filename = join(root, "subject.ts");
    const source =
      'export function choose(flag: boolean) {\n  return "😀";\n}\nconst sort = (a: string, b: string) => (a.length) - (b.length);\n';
    writeFileSync(filename, source);
    const position = (line: number, column: number) => ({ line, column });
    const entry = (name: string, line: number, column: number) => ({
      name,
      decl: { start: position(line, column), end: position(line, column + 1) },
      loc: { start: position(line, column), end: position(line, column + 1) },
      line,
    });
    const callbackColumn = source.split("\n")[3]!.indexOf("(a.length)");
    const coverage = () => provider.getProvider().createCoverageMap();
    const worker = coverage();
    worker.addFileCoverage({
      path: filename,
      statementMap: {},
      branchMap: {},
      s: {},
      b: {},
      fnMap: {
        "0": entry("choose", 1, source.indexOf("{")),
        "1": entry("sort", 4, callbackColumn),
        "2": entry("sort alias", 4, callbackColumn + 1),
      },
      f: { "0": 2, "1": 2, "2": 1 },
    });
    const native = coverage();
    native.addFileCoverage({
      path: filename,
      statementMap: {},
      branchMap: {},
      s: {},
      b: {},
      fnMap: { "0": entry("choose", 1, source.indexOf("function")), "1": entry("sort", 4, callbackColumn + 1) },
      f: { "0": 3, "1": 3 },
    });
    await mergeSourceFunctions(worker);
    await mergeSourceFunctions(native);
    expect(Object.values(worker.fileCoverageFor(filename).data.f)).toEqual([2, 2]);
    worker.merge(native);
    const result = worker.fileCoverageFor(filename).data;
    expect(Object.keys(result.fnMap)).toHaveLength(2);
    expect(Object.values(result.f)).toEqual([5, 5]);
    expect(result.fnMap["0"].loc.end).toEqual(position(3, 1));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([false, true])("keeps multiline callbacks distinct for uncovered=%s source maps", async (uncovered) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-signatures-"));
  try {
    const filename = join(root, "subject.ts");
    const source = [
      "function* collect(composed = false) {",
      "  const items = [];",
      "  return items.filter(",
      "    ({ capability: item, content }) =>",
      "      (composed ? item.group : item.partition) && content.delivery,",
      "  ).filter(",
      "    notice =>",
      "      (composed ? notice.group : notice.partition) && notice.pending?.delivery,",
      "  );",
      "}",
      "",
    ].join("\n");
    writeFileSync(filename, source);
    const position = (line: number, column: number | null) => ({ line, column });
    const entry = (declLine: number, declColumn: number, bodyLine: number, bodyColumn: number, endLine: number) => ({
      name: "anonymous",
      decl: { start: position(declLine, declColumn), end: position(declLine, null) },
      loc: { start: position(bodyLine, bodyColumn), end: position(endLine, null) },
      line: bodyLine,
    });
    const map = provider.getProvider().createCoverageMap();
    map.addFileCoverage({
      path: filename,
      statementMap: {},
      branchMap: {},
      s: {},
      b: {},
      fnMap: {
        "0": entry(1, 0, 1, source.indexOf("{"), 10),
        "1": entry(3, 21, 4, 25, 5),
        "2": entry(6, 10, 7, 10, 8),
      },
      f: { "0": uncovered ? 0 : 7, "1": uncovered ? 0 : 3, "2": uncovered ? 0 : 2 },
    });
    await mergeSourceFunctions(map);
    const result = map.fileCoverageFor(filename).data;
    expect(Object.values(result.f)).toEqual(uncovered ? [0, 0, 0] : [7, 3, 2]);
    expect(Object.keys(result.fnMap)).toHaveLength(3);
    expect(result.fnMap["0"].loc.end).toEqual(position(10, 1));
    expect(result.fnMap["1"].loc.start).toEqual(position(5, 6));
    expect(result.fnMap["1"].loc.end).toEqual(position(5, source.split("\n")[4]!.length - 1));
    expect(result.fnMap["2"].loc.start).toEqual(position(8, 6));
    expect(result.fnMap["2"].loc.end).toEqual(position(8, source.split("\n")[7]!.length - 1));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("preserves evidence when nested default callbacks have ambiguous signature ownership", async () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-coverage-ambiguous-signature-"));
  try {
    const filename = join(root, "subject.ts");
    const source = "function outer(run = () => 1) { return run(); }\n";
    writeFileSync(filename, source);
    const column = source.indexOf("=>");
    const loc = { start: { line: 1, column }, end: { line: 1, column: null } };
    const original = { name: "unresolved", decl: loc, loc, line: 1 };
    const map = provider.getProvider().createCoverageMap();
    map.addFileCoverage({
      path: filename,
      statementMap: {},
      branchMap: {},
      s: {},
      b: {},
      fnMap: { "0": original },
      f: { "0": 5 },
    });
    await mergeSourceFunctions(map);
    const result = map.fileCoverageFor(filename).data;
    expect(result.fnMap["0"]).toEqual(original);
    expect(result.f).toEqual({ "0": 5 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
