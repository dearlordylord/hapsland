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
const zodOperationsFixture = resolve(root, "experiments/declaration-extraction/fixtures/zod-operations");
const zodShadowFixture = resolve(root, "experiments/declaration-extraction/fixtures/zod-shadow");
const crossFrameworkFixture = resolve(root, "experiments/declaration-extraction/fixtures/cross-framework-context");
const effectFixture = resolve(root, "experiments/declaration-extraction/fixtures/effect");
const malformedFixture = resolve(root, "experiments/declaration-extraction/fixtures/malformed-half-written");
const missingConfigFixture = resolve(root, "experiments/declaration-extraction/fixtures/missing-config");
const unresolvedImportFixture = resolve(root, "experiments/declaration-extraction/fixtures/unresolved-import");
const cyclesFixture = resolve(root, "experiments/declaration-extraction/fixtures/cycles");
const evolutionFixture = resolve(root, "experiments/declaration-extraction/fixtures/evolution");
const ruleControlsFixture = resolve(root, "experiments/declaration-extraction/fixtures/rule-controls");

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
    for (const phase of ["processStartup", "initialize", "openDispatch", "coldExtraction", "warmExtraction"] as const) {
      expect(record.timingsMs[phase]).toEqual(expect.any(Number));
      expect(record.timingsMs[phase]).toBeGreaterThanOrEqual(0);
    }
    const timingEvidence = JSON.parse(readFileSync(resolve(root, "experiments/declaration-extraction/evidence/timing-summary.json"), "utf8"));
    const sharedBoundaries = timingEvidence.bucketBoundariesMs as number[];
    expect(sharedBoundaries.length).toBeGreaterThan(1);
    expect(sharedBoundaries).toEqual([...sharedBoundaries].sort((left, right) => left - right));
    expect(sharedBoundaries.every((boundary, index) => Number.isFinite(boundary) && boundary > 0 && (index === 0 || boundary > sharedBoundaries[index - 1]))).toBe(true);
    const declarationTimings = timingEvidence.byFixtureClass.declarations;
    expect(declarationTimings.sampleCount).toBe(2);
    for (const phase of ["processStartup", "initialize", "openDispatch", "coldExtraction", "warmExtraction"] as const) {
      const phaseTiming = declarationTimings.phaseTimingsMs[phase];
      expect(phaseTiming.sampleCount).toBe(2);
      expect(phaseTiming.minMs).toBeLessThanOrEqual(phaseTiming.medianMs);
      expect(phaseTiming.medianMs).toBeLessThanOrEqual(phaseTiming.maxMs);
      expect(Object.keys(phaseTiming.distributionMs).map(Number).every((bucket) => sharedBoundaries.includes(bucket))).toBe(true);
      expect(Object.values(phaseTiming.distributionMs).reduce((sum: number, count: number) => sum + count, 0)).toBe(phaseTiming.sampleCount);
    }
    const evidenceRecords = readFileSync(resolve(root, "experiments/declaration-extraction/evidence/records.jsonl"), "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    expect(evidenceRecords).toHaveLength(30);
    for (const evidenceRecord of evidenceRecords) {
      expect(evidenceRecord.latency.bucketBoundariesMs).toEqual(sharedBoundaries);
      for (const phase of ["processStartup", "initialize", "openDispatch", "coldExtraction", "warmExtraction"] as const) {
        const phaseTiming = evidenceRecord.latency.phaseTimingsMs[phase];
        expect(Object.keys(phaseTiming.distributionMs).map(Number).every((bucket) => sharedBoundaries.includes(bucket))).toBe(true);
        expect(Object.values(phaseTiming.distributionMs).reduce((sum: number, count: number) => sum + count, 0)).toBe(phaseTiming.sampleCount);
      }
    }
    expect(record.observations.files.directWorkspaceSourceReads).toBeGreaterThan(0);
    expect(record.observations.subprocess.directChildrenSpawnedByHarness).toBe(1);
    expect(record.observations.subprocess.descendantProcesses).toBeNull();
    expect(record.observations.subprocess.plugins).toBeNull();
    expect(record.observations.files.filesystemWrites).toBeNull();
    expect(record.observations.network.directNetworkApisInvokedByHarness).toBeNull();
    expect(record.observations.network.networkEgress).toBeNull();
    expect(record.observations.network.directNetworkInstrumentation).toBe("not-instrumented");
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
    expect(record.lsp.notifications["$/cancelRequest"]).toBeGreaterThan(0);
    expect(record.lsp.faultEvidence.clientResponseSuppression).toBe(true);
    expect(record.lsp.faultEvidence.clientCancelNotificationSent).toBe(true);
    expect(record.lsp.faultEvidence.serverCancellationAcknowledged).toBeNull();
  }, 30_000);

  test("keeps malformed or half-written source as a parser-error root", () => {
    const record = runFixture(malformedFixture, "half-written");
    expect(record.status).toBe("ok");
    expect(record.rootSelection.before[0].parserError).toBe(false);
    expect(record.rootSelection.after[0].parserError).toBe(true);
    expect(record.extraction.roots[0].parserError).toBe(true);
    expect(record.extraction.roots[0].source).not.toContain("}");
    expect(record.extraction.completeness.complete).toBe(false);
    expect(record.extraction.completeness.reasons).toContain("parser-error");
  }, 30_000);

  test("records a missing project configuration without hiding resolved local context", () => {
    const record = runFixture(missingConfigFixture, "root");
    expect(record.status).toBe("ok");
    expect(record.observations.files.configurationPathsDiscovered).toEqual([]);
    expect(record.extraction.context.map((declaration: any) => declaration.name)).toContain("LocalShape");
    expect(record.extraction.completeness.complete).toBe(true);
  }, 30_000);

  test("keeps an unresolved import explicit", () => {
    const record = runFixture(unresolvedImportFixture, "root");
    expect(record.status).toBe("ok");
    expect(record.extraction.edges).toEqual([
      expect.objectContaining({
        reference: expect.objectContaining({ name: "MissingImported" }),
        resolution: "unresolved",
        unresolved: true,
      }),
    ]);
    expect(record.extraction.completeness.reasons).toContain("definition-without-source-declaration");
  }, 30_000);

  test("terminates recursive references with a visible already-visited omission", () => {
    const record = runFixture(cyclesFixture, "root");
    expect(record.status).toBe("ok");
    expect(record.extraction.context.map((declaration: any) => declaration.name)).toEqual(["CycleB"]);
    expect(record.extraction.edges).toEqual([
      expect.objectContaining({ reference: expect.objectContaining({ name: "CycleB" }), included: true }),
      expect.objectContaining({ reference: expect.objectContaining({ name: "CycleA" }), omission: "already-visited", included: false }),
    ]);
    expect(record.extraction.completeness.complete).toBe(true);
  }, 30_000);

  test("records a controlled native-server crash without converting it to success", () => {
    const record = run("interface", ["--fault", "crash"]);
    expect(record.status).toBe("ok");
    expect(record.lsp.fault).toBe("crash");
    expect(record.lsp.faultEvidence.crashTriggered).toBe(true);
    expect(record.extraction.completeness.complete).toBe(false);
    expect(record.extraction.completeness.reasons).toContain("navigation-error");
    expect(record.extraction.edges[0].omission).toBe("navigation-error");
    expect(record.lsp.unexpectedOrFailedNavigation.some((entry: any) => String(entry.reason).includes("crash") || String(entry.reason).includes("EPIPE"))).toBe(true);
  }, 30_000);

  test("records stale-document dispatch as a distinct controllable fault", () => {
    const record = run("interface", ["--fault", "stale-document"]);
    expect(record.status).toBe("ok");
    expect(record.lsp.fault).toBe("stale-document");
    expect(record.lsp.faultEvidence.staleDocumentSent).toBe(true);
    expect(record.lsp.notifications["textDocument/didChange"]).toBe(1);
    expect(record.extraction.edges.find((edge: any) => edge.reference.name === "RenamedShape")?.resolution).toBe("null");
  }, 30_000);

  test("exercises declaration, depth, source, file, external-package, and elapsed caps", () => {
    const cases: Array<[string, Record<string, number>, string]> = [
      ["declarations", { declarations: 1 }, "declarations"],
      ["depth", { depth: 0 }, "depth"],
      ["source characters", { sourceCharacters: 1 }, "source-characters"],
      ["files", { files: 1 }, "files"],
      ["external packages", { externalPackages: 0 }, "external-packages"],
    ];
    for (const [, caps, reason] of cases) {
      const record = run("interface", ["--caps", JSON.stringify(caps)]);
      expect(record.extraction.completeness.complete).toBe(false);
      expect(record.extraction.completeness.reasons).toContain(reason);
      expect(record.extraction.completeness.caps[reason === "source-characters" ? "sourceCharacters" : reason === "external-packages" ? "externalPackages" : reason]).toBe(Object.values(caps)[0]);
    }
    const elapsed = run("interface", ["--fault", "nonresponding", "--caps", JSON.stringify({ elapsedMs: 20 })]);
    expect(elapsed.extraction.completeness.reasons).toContain("elapsed-time");
    expect(elapsed.extraction.completeness.observed.elapsedMs).toBeGreaterThanOrEqual(20);
    expect(elapsed.lsp.faultEvidence.clientResponseSuppression).toBe(true);
    expect(elapsed.lsp.faultEvidence.clientCancelNotificationSent).toBe(true);
    expect(elapsed.lsp.faultEvidence.serverCancellationAcknowledged).toBeNull();
  }, 60_000);

  test("records identity and materiality controls across formatting, rename, retarget, roots, move, deletion, and generics", () => {
    const formatting = runFixture(evolutionFixture, "formatting");
    expect(formatting.rootSelection.before[0].sourceHash).not.toBe(formatting.rootSelection.after[0].sourceHash);
    expect(formatting.rootSelection.before[0].name).toBe("Formatting");

    const rename = runFixture(evolutionFixture, "rename");
    expect(rename.rootSelection.before.map((root: any) => root.name)).toEqual(["BeforeName"]);
    expect(rename.rootSelection.after.map((root: any) => root.name)).toEqual(["AfterName"]);
    expect(rename.extraction.roots.map((root: any) => root.name)).toEqual(["AfterName", "BeforeName"]);

    const retarget = runFixture(evolutionFixture, "import-retarget");
    expect(retarget.extraction.context[0].path).toBe("src/types-b.ts");
    expect(retarget.input.edit.diff).toContain("types-b.ts");

    const multiple = runFixture(evolutionFixture, "multiple-root");
    expect(multiple.extraction.roots.map((root: any) => root.name)).toEqual(["RootOne", "RootTwo"]);

    const moved = runFixture(evolutionFixture, "move");
    expect(moved.rootSelection.before[0].name).toBe("Moved");
    expect(moved.rootSelection.after[0].name).toBe("Moved");
    expect(moved.rootSelection.before[0].range.byte.start).not.toBe(moved.rootSelection.after[0].range.byte.start);

    const deleted = runFixture(evolutionFixture, "deletion");
    expect(deleted.rootSelection.before.map((root: any) => root.name)).toEqual(["Deleted"]);
    expect(deleted.rootSelection.after).toEqual([]);
    expect(deleted.extraction.roots.map((root: any) => root.name)).toEqual(["Deleted"]);

    const generic = runFixture(evolutionFixture, "generic");
    expect(generic.extraction.roots.map((root: any) => root.name)).toEqual(["GenericBox", "GenericUse"]);
    expect(generic.extraction.edges.every((edge: any) => edge.reference.name === "GenericBox")).toBe(true);
  }, 60_000);

  test("repeated evolution runs keep roots, traversal order, omissions, completeness, and hashes stable", () => {
    const first = runFixture(evolutionFixture, "import-retarget");
    const second = runFixture(evolutionFixture, "import-retarget");
    expect(stable(first)).toEqual(stable(second));
    expect(first.extraction.edges.map((edge: any) => edge.id)).toEqual(["edge-0000"]);
    expect(first.extraction.roots.every((root: any) => /^[a-f0-9]{64}$/.test(root.sourceHash))).toBe(true);
  }, 30_000);

  test("keeps a type-rule missing-context case distinct from a diff-sufficient control", () => {
    const missingContext = runFixture(ruleControlsFixture, "missing-context");
    expect(missingContext.extraction.roots.map((root: any) => root.name)).toEqual(["DeliveryEvent"]);
    expect(missingContext.extraction.context.map((declaration: any) => declaration.name)).toEqual([
      "DeliveryStatus",
      "DeliveredAt",
    ]);
    expect(missingContext.extraction.edges.map((edge: any) => edge.reference.name)).toEqual([
      "DeliveryStatus",
      "DeliveredAt",
    ]);

    const diffSufficient = runFixture(ruleControlsFixture, "diff-sufficient");
    expect(diffSufficient.extraction.roots.map((root: any) => root.name)).toEqual(["Money"]);
    expect(diffSufficient.extraction.context).toEqual([]);
    expect(diffSufficient.extraction.edges).toEqual([]);
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

  test("keeps pinned Zod brand and check operations as partial opaque schemas", () => {
    const record = runFixture(zodOperationsFixture, "all");
    const roots = record.extraction.roots as Array<Record<string, any>>;
    expect(roots.map((root) => root.name)).toEqual(["Branded", "Checked", "Refined", "Transformed"]);
    for (const name of ["Branded", "Checked", "Refined", "Transformed"]) {
      const root = roots.find((candidate) => candidate.name === name)!;
      expect(root.schema.framework).toBe("zod");
      expect(root.schema.interpretation).toBe("partial");
      expect(root.schema.opaque.map((segment: any) => segment.source)).toEqual([root.schema.expression]);
    }
    expect(roots.find((root) => root.name === "Branded")?.schema.opaque[0].reason).toContain(".brand");
    expect(roots.find((root) => root.name === "Checked")?.schema.opaque[0].reason).toContain(".check");
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

  test("applies external package caps to referenced cross-framework schema provenance", () => {
    const extraction = (externalPackages: number) => runFixture(crossFrameworkFixture, "root", [
      "--caps",
      JSON.stringify({ externalPackages }),
    ]);
    const zero = extraction(0);
    expect(zero.extraction.roots.find((root: any) => root.name === "CrossRoot")?.schema.provenance).toBe("unresolved");
    expect(zero.extraction.context.find((declaration: any) => declaration.name === "EffectContext")?.schema.provenance).toBe("unresolved");
    expect(zero.extraction.schemaFailures).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "CrossRoot", reason: "external-packages" }),
      expect.objectContaining({ name: "EffectContext", reason: "external-packages" }),
    ]));
    const one = extraction(1);
    expect(one.extraction.roots.find((root: any) => root.name === "CrossRoot")?.schema.framework).toBe("zod");
    expect(one.extraction.context.find((declaration: any) => declaration.name === "EffectContext")?.schema.provenance).toBe("unresolved");
    expect(one.extraction.schemaFailures).toEqual([
      expect.objectContaining({ name: "EffectContext", reason: "external-packages" }),
    ]);
    expect(one.extraction.completeness.observed.externalPackages).toBe(1);
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
