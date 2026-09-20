import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const command = resolve(root, "experiments/declaration-extraction/extract.ts");
const fixture = resolve(root, "experiments/declaration-extraction/fixtures/representative");

const run = (edit: string, extra: string[] = []) => {
  const stdout = execFileSync(process.execPath, [command, "--fixture", fixture, "--edit", edit, ...extra], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2_000_000,
  });
  expect(stdout.trim().split(/\r?\n/)).toHaveLength(1);
  return JSON.parse(stdout) as Record<string, any>;
};

const stable = (record: Record<string, any>) => {
  const copy = structuredClone(record);
  delete copy.timingsMs;
  delete copy.positionalRequestCounts;
  delete copy.lsp;
  delete copy.extraction.completeness.observed;
  return copy;
};

describe("declaration extraction experiment black-box seam", () => {
  test("extracts an edited interface with local, alias, namespace, re-export, null, multiple, and external edges", () => {
    const record = run("interface");
    expect(record.status).toBe("ok");
    expect(record.versions.typescript).toBe("7.0.2");
    expect(record.versions.parser).toBe("0.25.1");
    expect(record.versions.grammar).toBe("0.23.2");
    expect(record.versions.binding.package).toContain("tree-sitter");
    expect(record.versions.runtime.name).toBe("node");
    expect(record.versions.typescriptServer.version).toBe("7.0.2");
    expect(record.input.edit.diff).toContain("shape?: RenamedShape");
    expect(record.input.edit.diff).toContain("shape: RenamedShape");
    expect(record.rootSelection.before.map((root: any) => root.name)).toEqual(["Order"]);
    expect(record.rootSelection.after.map((root: any) => root.name)).toEqual(["Order"]);
    expect(record.extraction.roots).toHaveLength(1);
    expect(record.extraction.roots[0].kind).toBe("interface");
    expect(record.extraction.roots[0].range.byte.end).toBeGreaterThan(record.extraction.roots[0].range.byte.start);
    expect(record.extraction.roots[0].range.utf16.start).toEqual({ line: 5, character: 0 });

    const edges = record.extraction.edges as Array<Record<string, any>>;
    const byName = (name: string): Record<string, any> => edges.find((edge) => edge.reference.name === name)!;
    expect(byName("LocalId").resolution).toBe("resolved");
    expect(byName("RenamedShape").definitions[0].declaration.name).toBe("ImportedShape");
    expect(byName("UserId").definitions[0].declaration.name).toBe("UserId");
    expect(byName("PublicShape").definitions[0].declaration.name).toBe("ReExported");
    expect(byName("Merged").resolution).toBe("multiple");
    expect(byName("ExternalThing").resolution).toBe("external");
    expect(byName("MissingShape").resolution).toBe("null");
    expect(record.extraction.completeness.complete).toBe(false);
    expect(record.extraction.completeness.reasons).toEqual(
      expect.arrayContaining(["multiple-definitions", "null-definition", "external-package-terminal"]),
    );
    expect(record.positionalRequestCounts.cold["textDocument/definition"]).toBeGreaterThan(0);
    expect(record.positionalRequestCounts.warm["textDocument/definition"]).toBeGreaterThan(0);
    expect(record.lsp.serverRequests["client/registerCapability"]).toBeGreaterThan(0);
    expect(record.lsp.shutdownParamsOmitted).toBe(true);
    expect(record.lsp.exitParamsOmitted).toBe(true);
    expect(record.evaluation.observed).toBe(true);
    expect(record.evaluation.modulesImported).toBe(false);
  }, 30_000);

  test("extracts a changed type alias and follows its local context", () => {
    const record = run("alias");
    expect(record.status).toBe("ok");
    expect(record.rootSelection.before.map((root: any) => root.name)).toEqual(["OrderPayload"]);
    expect(record.rootSelection.after.map((root: any) => root.name)).toEqual(["OrderPayload"]);
    expect(record.extraction.roots[0].kind).toBe("type-alias");
    expect(record.extraction.context.map((declaration: any) => declaration.name)).toEqual(
      expect.arrayContaining(["Order", "LocalId"]),
    );
    expect(record.determinism.coldWarmStable).toBe(true);
  }, 30_000);

  test("records deterministic bounded omissions without hiding unresolved context", () => {
    const record = run("interface", [
      "--caps",
      JSON.stringify({ declarations: 2, depth: 0, sourceCharacters: 500, files: 1, externalPackages: 0, elapsedMs: 4_000 }),
    ]);
    expect(record.extraction.context).toHaveLength(0);
    expect(record.extraction.completeness.complete).toBe(false);
    expect(record.extraction.completeness.reasons).toEqual(expect.arrayContaining(["depth"]));
    expect(record.extraction.edges.every((edge: any) => edge.omission === "depth")).toBe(true);
    const second = run("interface", [
      "--caps",
      JSON.stringify({ declarations: 2, depth: 0, sourceCharacters: 500, files: 1, externalPackages: 0, elapsedMs: 4_000 }),
    ]);
    expect(stable(record)).toEqual(stable(second));
  }, 60_000);

  test("does not depend on parser-query or incidental server-message order", () => {
    const source = readFileSync(resolve(fixture, "workspace/src/target.ts"), "utf8");
    expect(source).toContain("Types.UserId");
    const record = run("interface");
    expect(record.extraction.edges.map((edge: any) => edge.reference.name)).toEqual([
      "LocalId",
      "RenamedShape",
      "UserId",
      "PublicShape",
      "Merged",
      "ExternalThing",
      "MissingShape",
    ]);
  }, 30_000);
});
