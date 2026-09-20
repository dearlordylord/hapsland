import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const command = resolve(root, "experiments/declaration-extraction/extract.ts");
const fixture = resolve(root, "experiments/declaration-extraction/fixtures/representative");
const zodFixture = resolve(root, "experiments/declaration-extraction/fixtures/zod");
const zodShadowFixture = resolve(root, "experiments/declaration-extraction/fixtures/zod-shadow");
const effectFixture = resolve(root, "experiments/declaration-extraction/fixtures/effect");

const runFixture = (fixturePath: string, edit: string, extra: string[] = []) => {
  const stdout = execFileSync(process.execPath, [command, "--fixture", fixturePath, "--edit", edit, ...extra], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 2_000_000,
    timeout: 20_000,
  });
  expect(stdout.trim().split(/\r?\n/)).toHaveLength(1);
  return JSON.parse(stdout) as Record<string, any>;
};

const run = (edit: string, extra: string[] = []) => runFixture(fixture, edit, extra);

const stable = (record: Record<string, any>) => {
  const copy = structuredClone(record);
  delete copy.timingsMs;
  delete copy.positionalRequestCounts;
  delete copy.lsp;
  delete copy.extraction.completeness.observed;
  return copy;
};

const evaluateSchemaFixtureCopy = (fixturePath: string, supportFiles: string[], token: string) => {
  const temporary = mkdtempSync(join(tmpdir(), "declaration-schema-control-"));
  const sourceDirectory = join(temporary, "src");
  mkdirSync(sourceDirectory, { recursive: true });
  writeFileSync(join(temporary, "package.json"), '{"type":"module"}\n', "utf8");
  symlinkSync(resolve(root, "node_modules"), join(temporary, "node_modules"), "dir");
  copyFileSync(join(fixturePath, "workspace/src/target.ts"), join(sourceDirectory, "target.ts"));
  for (const supportFile of supportFiles) {
    copyFileSync(join(fixturePath, `workspace/src/${supportFile}`), join(sourceDirectory, supportFile));
  }
  try {
    execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(join(sourceDirectory, "target.ts")).href)})`],
      {
        cwd: temporary,
        env: { ...process.env, DECLARATION_EXTRACTION_MARKER_TOKEN: token },
        encoding: "utf8",
        timeout: 20_000,
      },
    );
    const marker = join(temporary, ".module-init.marker");
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, "utf8")).toBe(token);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};

describe("declaration extraction experiment black-box seam", () => {
  test("extracts an edited interface with local, alias, namespace, re-export, null, multiple, and external edges", () => {
    const record = run("interface");
    expect(record.status).toBe("ok");
    expect(record.versions.typescript).toBe("7.0.2");
    expect(record.versions.parser).toBe("0.25.1");
    expect(record.versions.grammar).toBe("0.23.2");
    expect(record.versions.binding.parser).toEqual({
      package: "tree-sitter",
      version: "0.25.1",
      nativeAddon: "tree-sitter.node",
    });
    expect(record.versions.binding.grammar).toEqual({
      package: "tree-sitter-typescript",
      version: "0.23.2",
      nativeAddon: "tree-sitter-typescript.node",
    });
    expect(record.versions.runtime.name).toBe("node");
    expect(record.versions.typescriptServer.version).toBe("7.0.2");
    expect(record.input.edit.diff).toContain("shape?: RenamedShape");
    expect(record.input.edit.diff).toContain("shape: RenamedShape");
    expect(record.rootSelection.before.map((root: any) => root.name)).toEqual(["Order"]);
    expect(record.rootSelection.after.map((root: any) => root.name)).toEqual(["Order"]);
    expect(record.extraction.roots).toHaveLength(1);
    expect(record.extraction.roots[0].kind).toBe("interface");
    expect(record.extraction.roots[0].range.byte.end).toBeGreaterThan(record.extraction.roots[0].range.byte.start);
    expect(record.extraction.roots[0].range.utf16.start).toEqual({ line: 6, character: 0 });

    const edges = record.extraction.edges as Array<Record<string, any>>;
    const byName = (name: string): Record<string, any> => edges.find((edge) => edge.reference.name === name)!;
    expect(byName("LocalId").resolution).toBe("resolved");
    expect(byName("RenamedShape").definitions[0].declaration.name).toBe("ImportedShape");
    expect(byName("UserId").definitions[0].declaration.name).toBe("UserId");
    expect(byName("PublicShape").definitions[0].declaration.name).toBe("ReExported");
    expect(byName("Merged").resolution).toBe("multiple");
    expect(byName("ExternalThing").resolution).toBe("external");
    expect(byName("ExternalThing").definitions[0].packageName).toBe("external-types");
    expect(byName("ExternalThing").definitions[0].uri).toBe("fixture://external/external-types");
    expect(byName("ScopedThing").resolution).toBe("external");
    expect(byName("ScopedThing").definitions[0].packageName).toBe("@scope/external-types");
    expect(byName("ScopedThing").definitions[0].uri).toBe("fixture://external/%40scope%2Fexternal-types");
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
    expect(record.evaluation.markerChanged).toBe(false);
    expect(record.evaluation.markerTokenObserved).toBe(false);
    expect(record.evaluation.modulesImported).toBe(false);
    expect(record.evaluation.noEvaluationObserved).toBe(true);
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain("/tmp/");
    expect(record.lsp.stderr).not.toContain(root);
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

  test("keeps unscoped and scoped external package caps explicit at 0, 1, and 2", () => {
    for (const [cap, expected] of [
      [0, ["external-packages", "external-packages"]],
      [1, ["external-package-terminal", "external-packages"]],
      [2, ["external-package-terminal", "external-package-terminal"]],
    ] as const) {
      const record = run("interface", ["--caps", JSON.stringify({ externalPackages: cap })]);
      expect(record.extraction.edges.filter((edge: any) => edge.resolution === "external").map((edge: any) => edge.omission)).toEqual(expected);
      expect(record.extraction.edges.filter((edge: any) => edge.resolution === "external").map((edge: any) => edge.definitions[0].packageName)).toEqual([
        "external-types",
        "@scope/external-types",
      ]);
      expect(record.extraction.completeness.observed.externalPackages).toBe(cap);
    }
  }, 60_000);

  test("reports a pre-existing marker as an evaluation-observation failure path", () => {
    const marker = resolve(fixture, "workspace/.module-init.marker");
    writeFileSync(marker, "preexisting", "utf8");
    try {
      const record = run("interface");
      expect(record.evaluation.existsBefore).toBe(true);
      expect(record.evaluation.existsAfter).toBe(true);
      expect(record.evaluation.observed).toBe(false);
      expect(record.evaluation.modulesImported).toBeNull();
      expect(record.evaluation.noEvaluationObserved).toBeNull();
      expect(record.evaluation.observation).toBe("indeterminate-marker-preexisted");
    } finally {
      if (existsSync(marker)) unlinkSync(marker);
    }
  }, 30_000);

  test("positive control copies and evaluates the fixture module and observes its unique marker token", () => {
    const temporary = mkdtempSync(join(tmpdir(), "declaration-extraction-control-"));
    const copiedSource = join(temporary, "src", "target.ts");
    mkdirSync(join(temporary, "src"), { recursive: true });
    writeFileSync(join(temporary, "package.json"), '{"type":"module"}\n', "utf8");
    copyFileSync(resolve(fixture, "workspace/src/target.ts"), copiedSource);
    try {
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `await import(${JSON.stringify(pathToFileURL(copiedSource).href)})`,
        ],
        {
          cwd: temporary,
          env: { ...process.env, DECLARATION_EXTRACTION_MARKER_TOKEN: "positive-control-token" },
          encoding: "utf8",
          timeout: 20_000,
        },
      );
      const marker = join(temporary, ".module-init.marker");
      expect(existsSync(marker)).toBe(true);
      expect(readFileSync(marker, "utf8")).toBe("positive-control-token");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }, 30_000);

  test("enforces the elapsed deadline across a controlled nonresponding navigation client", () => {
    const record = run("interface", [
      "--fault",
      "nonresponding",
      "--caps",
      JSON.stringify({ elapsedMs: 25 }),
    ]);
    expect(record.extraction.context).toHaveLength(0);
    expect(record.extraction.edges[0].resolution).toBe("timeout");
    expect(record.extraction.edges[0].omission).toBe("elapsed-time");
    expect(record.extraction.completeness.reasons).toEqual(expect.arrayContaining(["elapsed-time"]));
    expect(record.extraction.completeness.observed.elapsedMs).toBeGreaterThanOrEqual(25);
    expect(record.lsp.unexpectedOrFailedNavigation[0].reason).toContain("deadline exceeded");
  }, 30_000);

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
      "ScopedThing",
      "MissingShape",
    ]);
  }, 30_000);

  test("recognizes Zod roots through native constructor provenance and preserves opaque transforms", () => {
    const record = runFixture(zodFixture, "src/target.ts:0:0-32:0");
    expect(record.status).toBe("ok");
    expect(record.versions.zod).toBe("4.6.5");
    expect(record.versions.frameworks.zod).toEqual({ package: "zod", version: "4.6.5" });
    const roots = record.extraction.roots as Array<Record<string, any>>;
    expect(roots.map((root) => root.name)).toEqual([
      "Address",
      "Composed",
      "NamedAlias",
      "ReExported",
      "Transformed",
      "Wrapped",
      "MissingConstructor",
    ]);
    expect(roots.filter((root) => root.schema?.framework === "zod").map((root) => root.name)).toEqual([
      "Address",
      "Composed",
      "NamedAlias",
      "ReExported",
      "Transformed",
    ]);
    expect(roots.find((root) => root.name === "Wrapped")?.schema.provenance).toBe("project");
    const transformed = roots.find((root) => root.name === "Transformed")!;
    expect(transformed.schema.interpretation).toBe("partial");
    expect(transformed.schema.opaque.map((segment: any) => segment.source)).toEqual([
      transformed.schema.expression,
      transformed.schema.expression,
    ]);
    expect(transformed.schema.expression).toContain(".transform");
    expect(roots.some((root) => ["Ordinary", "OrdinaryNamespace", "OrdinaryCall", "Treeified", "Locales", "Regexes"].includes(root.name))).toBe(false);
    expect(roots.find((root) => root.name === "MissingConstructor")?.schema.provenance).toBe("null");
    expect(record.extraction.completeness.reasons).toContain("schema-unresolved");
    expect(record.evaluation.modulesImported).toBe(false);
    expect(record.evaluation.noEvaluationObserved).toBe(true);
    expect(record.positionalRequestCounts.cold["textDocument/definition"]).toBeGreaterThan(0);
    expect(record.positionalRequestCounts.warm["textDocument/definition"]).toBeGreaterThan(0);
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain("/tmp/");
  }, 60_000);

  test("rejects unallowlisted Zod framework exports such as regexes", () => {
    const record = runFixture(zodFixture, "src/target.ts:0:0-40:0");
    expect((record.extraction.roots as Array<Record<string, any>>).some((root) => root.name === "Regexes")).toBe(false);
  }, 60_000);

  test("does not request Zod provenance when the external package cap is zero", () => {
    const record = runFixture(zodFixture, "src/target.ts:0:0-40:0", [
      "--caps",
      JSON.stringify({ externalPackages: 0 }),
    ]);
    expect(record.positionalRequestCounts.cold["textDocument/definition"]).toBeLessThan(18);
    expect(record.extraction.schemaFailures.some((failure: any) => failure.name === "Address" && failure.reason === "external-packages")).toBe(true);
    expect(record.extraction.roots.find((root: any) => root.name === "Address")?.schema.constructor.definitions).toHaveLength(0);
    expect(record.extraction.completeness.observed.externalPackages).toBe(0);
  }, 60_000);

  test("applies the source-character cap cumulatively across schema roots", () => {
    const record = runFixture(zodFixture, "src/target.ts:0:0-40:0", [
      "--caps",
      JSON.stringify({ sourceCharacters: 200 }),
    ]);
    expect(record.extraction.roots.find((root: any) => root.name === "Address")?.schema.constructor.definitions.length).toBeGreaterThan(0);
    expect(record.extraction.roots.find((root: any) => root.name === "Composed")?.schema.constructor.definitions.length).toBeGreaterThan(0);
    expect(record.extraction.schemaFailures.some((failure: any) => failure.name === "NamedAlias" && failure.reason === "source-characters")).toBe(true);
    expect(record.extraction.completeness.reasons).toContain("source-characters");
  }, 60_000);

  test("uses LSP identity for same-name shadowed schema references", () => {
    const record = runFixture(zodShadowFixture, "all");
    const roots = record.extraction.roots as Array<Record<string, any>>;
    expect(roots.map((root) => root.name)).toEqual(["Address", "GenuineWrapper", "ShadowWrapper"]);
    const shadowReferences = (record.extraction.edges as Array<Record<string, any>>).filter(
      (edge) => edge.from.name === "ShadowWrapper" && edge.reference.name === "Address",
    );
    expect(shadowReferences.some((edge) => edge.definitions?.[0]?.declaration?.name === "ShadowWrapper")).toBe(true);
    expect(shadowReferences.filter((edge) => edge.definitions?.[0]?.declaration?.name === "Address")).toHaveLength(1);
  }, 60_000);

  test("recognizes Effect Schema named, namespace, aliased, re-exported, composed, transformed, and declared roots", () => {
    const record = runFixture(effectFixture, "src/target.ts:0:0-36:0");
    expect(record.status).toBe("ok");
    expect(record.versions.effectSchema).toBe("4.0.0-rc.116");
    expect(record.versions.frameworks.effectSchema).toEqual({
      package: "effect",
      subpath: "effect/Schema",
      version: "4.0.0-rc.116",
    });
    const roots = record.extraction.roots as Array<Record<string, any>>;
    expect(roots.map((root) => root.name)).toEqual([
      "Address",
      "Composed",
      "Namespaced",
      "ReExported",
      "Optional",
      "Transformed",
      "Declared",
      "Wrapped",
      "MissingConstructor",
    ]);
    expect(roots.filter((root) => root.schema?.framework === "effect-schema")).toHaveLength(7);
    expect(roots.some((root) => root.schema?.provenance === "multiple")).toBe(true);
    expect(roots.find((root) => root.name === "Transformed")?.schema.interpretation).toBe("partial");
    expect(roots.find((root) => root.name === "Declared")?.schema.opaque[0].source).toContain("declareSchema");
    expect(roots.find((root) => root.name === "Wrapped")?.schema.provenance).toBe("project");
    expect(roots.some((root) => ["Ordinary", "OrdinaryNamespace", "OrdinaryCall", "IsSchema"].includes(root.name))).toBe(false);
    expect(roots.find((root) => root.name === "MissingConstructor")?.schema.provenance).toBe("null");
    expect(record.evaluation.modulesImported).toBe(false);
    expect(record.evaluation.noEvaluationObserved).toBe(true);
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain("/tmp/");
  }, 60_000);

  test("positive controls evaluate copied Zod and Effect fixtures while extraction leaves markers absent", () => {
    evaluateSchemaFixtureCopy(zodFixture, ["zod-helpers.ts", "zod-reexports.ts"], "zod-positive-control");
    evaluateSchemaFixtureCopy(effectFixture, ["effect-helpers.ts", "effect-reexports.ts"], "effect-positive-control");
    for (const marker of [
      resolve(zodFixture, "workspace/.module-init.marker"),
      resolve(effectFixture, "workspace/.module-init.marker"),
    ]) {
      expect(existsSync(marker)).toBe(false);
    }
  }, 60_000);
});
