import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import * as os from "node:os";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gitCandidateHints } from "./git-hints.ts";
import {
  createFifoFixture,
  createSymlinkFixture,
  createWorkspace,
  createWorktree,
  gitOutput,
  pathIn,
  removeFixtureFile,
  removeWorktree,
  writeFixtureFile,
} from "./fixtures.ts";
import { makePolicy } from "./policy.ts";
import { scanManifest } from "./scan.ts";
import { ManifestStateStore, reconcile } from "./state.ts";
import { summarizeIssues, type Change, type ReconcileResult, type ScanStats } from "./protocol.ts";

const SENTINEL = "EXCLUDED-SENTINEL-DO-NOT-READ-ISSUE-4";
const policy = makePolicy({ excludes: ["excluded/**"] });
const partialExclusionPolicy = makePolicy({ excludes: ["excluded/*.ts"] });
const evidenceCommand = "node --experimental-strip-types experiments/shell-write-detection/run.ts --write-evidence";

type ScenarioRecord = {
  readonly id: string;
  readonly passed: boolean;
  readonly status?: string;
  readonly coverage?: string;
  readonly changes?: ReadonlyArray<{ readonly path: string; readonly kind: string }>;
  readonly issueSummary?: ReadonlyArray<{ readonly code: string; readonly count: number }>;
  readonly facts?: Readonly<Record<string, boolean | number | string>>;
};

type BenchmarkRecord = {
  readonly tree: string;
  readonly files: number;
  readonly phase: string;
  readonly eligibleFiles: number;
  readonly bytesRead: number;
  readonly contentReads: number;
  readonly stateBytes: number;
  readonly wallMs: number;
  readonly cpuUserMs: number;
  readonly cpuSystemMs: number;
  readonly changes: number;
};

const commandVersion = (command: string, args: ReadonlyArray<string>): string => {
  try {
    return execFileSync(command, args, { encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
};

const changeShape = (
  changes: ReadonlyArray<Change>,
): ReadonlyArray<{ readonly path: string; readonly kind: string }> =>
  changes.map(({ path, kind }) => ({ path, kind }));

const resultRecord = (result: ReconcileResult): Omit<ScenarioRecord, "id" | "passed"> => ({
  status: result.status,
  coverage: result.coverage,
  changes: changeShape(result.changes),
  issueSummary: summarizeIssues(result.issues),
});

const basicFacts = (result: ReconcileResult): Record<string, boolean | number | string> => ({
  advanced: result.advanced,
  filesVisited: result.stats.filesVisited,
  eligibleFiles: result.stats.eligibleFiles,
  bytesRead: result.stats.bytesRead,
  contentReads: result.stats.contentReads,
});

const baseline = async (
  root: string,
  stateDirectory: string,
  capturedPolicy = policy,
): Promise<{ readonly store: ManifestStateStore; readonly result: ReconcileResult }> => {
  const store = new ManifestStateStore(stateDirectory);
  const result = await reconcile({ root, policy: capturedPolicy, store });
  assert.equal(result.status, "baseline_seeded");
  return { store, result };
};

const runDirtyStart = async (): Promise<ScenarioRecord> => {
  const fixture = await createWorkspace("dirty-start");
  try {
    await writeFixtureFile(fixture.root, "src/preexisting.ts", "export const beforeSession = true;\n");
    await writeFixtureFile(fixture.root, "src/tracked.ts", "export const tracked = 2;\n");
    const first = await baseline(fixture.root, fixture.stateDirectory);
    const loaded = await first.store.load(fixture.root, policy.digest);
    assert.equal(loaded.kind, "valid");
    if (loaded.kind !== "valid") throw new Error("unreachable");
    assert.ok(loaded.state.manifest.entries.some((entry) => entry.path === "src/preexisting.ts"));
    await writeFixtureFile(fixture.root, "src/tracked.ts", "export const tracked = 3;\n");
    const second = await reconcile({ root: fixture.root, policy, store: first.store });
    assert.deepEqual(changeShape(second.changes), [{ path: "src/tracked.ts", kind: "modified" }]);
    return {
      id: "dirty-start",
      passed: true,
      ...resultRecord(second),
      facts: { ...basicFacts(second), baselineIncludedPreexistingDirtyFile: true },
    };
  } finally {
    await fixture.dispose();
  }
};

const runNetChanges = async (): Promise<ScenarioRecord> => {
  const fixture = await createWorkspace("net-changes");
  try {
    await writeFixtureFile(fixture.root, "src/change.ts", "export const change = 1;\n");
    await writeFixtureFile(fixture.root, "src/remove.ts", "export const remove = 1;\n");
    await writeFixtureFile(fixture.root, "src/rename-old.ts", "export const renamed = 1;\n");
    gitOutput(fixture.root, ["add", "src/change.ts", "src/remove.ts", "src/rename-old.ts"]);
    gitOutput(fixture.root, ["commit", "-qm", "net change baseline"]);
    const { store } = await baseline(fixture.root, fixture.stateDirectory);
    await writeFixtureFile(fixture.root, "src/add.ts", "export const add = 1;\n");
    await writeFixtureFile(fixture.root, "src/change.ts", "export const change = 2;\n");
    await removeFixtureFile(fixture.root, "src/remove.ts");
    await rename(pathIn(fixture.root, "src/rename-old.ts"), pathIn(fixture.root, "src/rename-new.ts"));
    const hints = gitCandidateHints(fixture.root);
    const hintedPaths = new Set(hints.map((hint) => hint.path));
    assert.ok(hintedPaths.has("src/add.ts"));
    assert.ok(hintedPaths.has("src/change.ts"));
    assert.ok(hintedPaths.has("src/remove.ts"));
    assert.ok(hintedPaths.has("src/rename-old.ts"));
    assert.ok(hintedPaths.has("src/rename-new.ts"));
    const result = await reconcile({ root: fixture.root, policy, store });
    assert.equal(result.status, "complete");
    assert.deepEqual(changeShape(result.changes), [
      { path: "src/add.ts", kind: "added" },
      { path: "src/change.ts", kind: "modified" },
      { path: "src/remove.ts", kind: "deleted" },
      { path: "src/rename-new.ts", kind: "added" },
      { path: "src/rename-old.ts", kind: "deleted" },
    ]);
    return {
      id: "add-modify-delete-rename-as-delete-plus-add",
      passed: true,
      ...resultRecord(result),
      facts: { ...basicFacts(result), gitHintCount: hints.length, renameIdentityInferred: false },
    };
  } finally {
    await fixture.dispose();
  }
};

const runIgnoredAndExcluded = async (): Promise<ScenarioRecord> => {
  const fixture = await createWorkspace("ignored-excluded");
  try {
    const { store } = await baseline(fixture.root, fixture.stateDirectory);
    await writeFixtureFile(fixture.root, "src/ignored.ts", "export const ignored = true;\n");
    await writeFixtureFile(fixture.root, "src/untracked.ts", "export const untracked = true;\n");
    await writeFixtureFile(fixture.root, "excluded/secret.ts", SENTINEL);
    const hints = gitCandidateHints(fixture.root);
    assert.ok(hints.some((hint) => hint.path === "src/ignored.ts" && hint.ignored));
    const scan = await scanManifest(fixture.root, policy);
    assert.equal(scan.complete, true);
    assert.ok(scan.manifest?.entries.some((entry) => entry.path === "src/ignored.ts"));
    assert.ok(scan.manifest?.entries.some((entry) => entry.path === "src/untracked.ts"));
    assert.equal(scan.readPaths.includes("excluded/secret.ts"), false);
    assert.equal(JSON.stringify(scan).includes(SENTINEL), false);
    const result = await reconcile({ root: fixture.root, policy, store });
    assert.deepEqual(changeShape(result.changes), [
      { path: "src/ignored.ts", kind: "added" },
      { path: "src/untracked.ts", kind: "added" },
    ]);
    const statePath = await store.pathForRoot(fixture.root);
    const persisted = await readFile(statePath, "utf8");
    assert.equal(persisted.includes(SENTINEL), false);
    return {
      id: "product-eligible-ignored-untracked-and-excluded-sentinel",
      passed: true,
      ...resultRecord(result),
      facts: {
        ...basicFacts(result),
        ignoredHintObserved: true,
        ignoredEligibleDetected: true,
        excludedReadCount: 0,
        excludedPersisted: false,
        excludedEmitted: false,
      },
    };
  } finally {
    await fixture.dispose();
  }
};

const runMixedExtensionExclusion = async (): Promise<ScenarioRecord> => {
  const fixture = await createWorkspace("mixed-extension-exclusion");
  try {
    const { store } = await baseline(fixture.root, fixture.stateDirectory, partialExclusionPolicy);
    await writeFixtureFile(fixture.root, "excluded/secret.ts", SENTINEL);
    await writeFixtureFile(fixture.root, "excluded/keep.js", "module.exports = 1;\n");
    const scan = await scanManifest(fixture.root, partialExclusionPolicy);
    assert.equal(scan.complete, true);
    assert.equal(scan.readPaths.includes("excluded/secret.ts"), false);
    assert.equal(scan.readPaths.includes("excluded/keep.js"), true);
    assert.ok(scan.manifest?.entries.some((entry) => entry.path === "excluded/keep.js"));
    assert.equal(scan.manifest?.entries.some((entry) => entry.path === "excluded/secret.ts"), false);
    assert.equal(JSON.stringify(scan).includes(SENTINEL), false);
    const result = await reconcile({ root: fixture.root, policy: partialExclusionPolicy, store });
    assert.equal(result.status, "complete");
    assert.deepEqual(changeShape(result.changes), [{ path: "excluded/keep.js", kind: "added" }]);
    return {
      id: "partial-exclude-traverses-mixed-extension-directory",
      passed: true,
      ...resultRecord(result),
      facts: {
        ...basicFacts(result),
        excludedTypeNeverRead: true,
        eligibleSiblingIncluded: true,
        excludedSentinelPersisted: false,
      },
    };
  } finally {
    await fixture.dispose();
  }
};

const runExactRevert = async (): Promise<ScenarioRecord> => {
  const fixture = await createWorkspace("exact-revert");
  try {
    const { store } = await baseline(fixture.root, fixture.stateDirectory);
    const original = "export const tracked = 1;\n";
    await writeFixtureFile(fixture.root, "src/tracked.ts", "export const tracked = 999;\n");
    await writeFixtureFile(fixture.root, "src/tracked.ts", original);
    const result = await reconcile({ root: fixture.root, policy, store });
    assert.equal(result.changes.length, 0);
    return {
      id: "exact-revert-before-checkpoint",
      passed: true,
      ...resultRecord(result),
      facts: { ...basicFacts(result), netChangeOnly: true },
    };
  } finally {
    await fixture.dispose();
  }
};

const runSymlinkAndNonregular = async (): Promise<ScenarioRecord> => {
  const fixture = await createWorkspace("symlink-nonregular");
  try {
    await createSymlinkFixture(fixture.root);
    createFifoFixture(fixture.root);
    const { store } = await baseline(fixture.root, fixture.stateDirectory);
    const scan = await scanManifest(fixture.root, policy);
    assert.equal(scan.complete, true);
    assert.equal(scan.readPaths.includes("src/link.ts"), false);
    assert.equal(scan.readPaths.includes("src/pipe.ts"), false);
    assert.ok(scan.skipped.some((entry) => entry.path === "src/link.ts" && entry.reason === "symlink"));
    assert.ok(scan.skipped.some((entry) => entry.path === "src/pipe.ts" && entry.reason === "nonregular"));
    const result = await reconcile({ root: fixture.root, policy, store });
    return {
      id: "symlink-and-nonregular-skipped",
      passed: true,
      ...resultRecord(result),
      facts: { ...basicFacts(result), symlinkReadCount: 0, nonregularReadCount: 0 },
    };
  } finally {
    await fixture.dispose();
  }
};

const runMutationDuringRead = async (): Promise<ScenarioRecord> => {
  const fixture = await createWorkspace("mutation-during-read");
  try {
    await writeFixtureFile(fixture.root, "src/race.ts", "export const race = 'before';\n");
    const { store } = await baseline(fixture.root, fixture.stateDirectory);
    let injected = false;
    const result = await reconcile({
      root: fixture.root,
      policy,
      store,
      scanOptions: {
        readFile: async (absolutePath, relativePath) => {
          const bytes = await readFile(absolutePath);
          if (!injected && relativePath === "src/race.ts") {
            injected = true;
            await writeFixtureFile(fixture.root, "src/race.ts", "export const race = 'after';\n");
          }
          return bytes;
        },
      },
    });
    assert.equal(result.status, "incomplete");
    assert.equal(result.coverage, "unknown");
    assert.equal(result.advanced, false);
    assert.equal(result.issues.some((issue) => issue.code === "unstable_read"), true);
    const after = await reconcile({ root: fixture.root, policy, store });
    assert.deepEqual(changeShape(after.changes), [{ path: "src/race.ts", kind: "modified" }]);
    return {
      id: "mutation-during-stable-read",
      passed: true,
      ...resultRecord(result),
      facts: { ...basicFacts(result), staleReadRejected: true, nextCheckpointFindsMutation: true },
    };
  } finally {
    await fixture.dispose();
  }
};

const runMutationDuringDirectoryTraversal = async (): Promise<ScenarioRecord> => {
  const fixture = await createWorkspace("mutation-during-directory-traversal");
  try {
    await writeFixtureFile(fixture.root, "a/initial.ts", "export const initial = true;\n");
    await writeFixtureFile(fixture.root, "b/initial.ts", "export const other = true;\n");
    const { store } = await baseline(fixture.root, fixture.stateDirectory);
    let injected = false;
    const result = await reconcile({
      root: fixture.root,
      policy,
      store,
      scanOptions: {
        beforeDirectoryRead: async (_absolutePath, relativePath) => {
          if (!injected && relativePath === "b") {
            injected = true;
            await writeFixtureFile(fixture.root, "a/late.ts", "export const late = true;\n");
          }
        },
      },
    });
    assert.equal(result.status, "incomplete");
    assert.equal(result.coverage, "unknown");
    assert.equal(result.advanced, false);
    assert.equal(result.issues.some((issue) => issue.code === "unstable_read" && issue.path === "a"), true);
    const after = await reconcile({ root: fixture.root, policy, store });
    assert.equal(after.status, "complete");
    assert.deepEqual(changeShape(after.changes), [{ path: "a/late.ts", kind: "added" }]);
    return {
      id: "concurrent-add-in-already-enumerated-directory-is-incomplete",
      passed: true,
      ...resultRecord(result),
      facts: {
        ...basicFacts(result),
        injectedWhileSiblingEnumerated: injected,
        treeMutationRejected: true,
        stateAdvancedOnMutation: false,
        nextCheckpointFindsLateFile: true,
      },
    };
  } finally {
    await fixture.dispose();
  }
};

const runFailureSemantics = async (): Promise<ScenarioRecord> => {
  const fixture = await createWorkspace("failures");
  try {
    await writeFixtureFile(fixture.root, "src/read-failure.ts", "export const readFailure = 1;\n");
    const { store } = await baseline(fixture.root, fixture.stateDirectory);
    const before = await store.load(fixture.root, policy.digest);
    assert.equal(before.kind, "valid");
    if (before.kind !== "valid") throw new Error("unreachable");
    const readFailure = await reconcile({
      root: fixture.root,
      policy,
      store,
      scanOptions: { failReadPaths: new Set(["src/read-failure.ts"]) },
    });
    assert.equal(readFailure.status, "incomplete");
    assert.equal(readFailure.advanced, false);
    const afterReadFailure = await store.load(fixture.root, policy.digest);
    assert.equal(afterReadFailure.kind, "valid");
    if (afterReadFailure.kind !== "valid") throw new Error("unreachable");
    assert.equal(afterReadFailure.state.sequence, before.state.sequence);
    await writeFixtureFile(fixture.root, "src/enumeration-failure/hidden.ts", "export const hidden = 1;\n");
    const enumerationFailure = await reconcile({
      root: fixture.root,
      policy,
      store,
      scanOptions: { failDirectoryPaths: new Set(["src/enumeration-failure"]) },
    });
    assert.equal(enumerationFailure.status, "incomplete");
    assert.equal(enumerationFailure.advanced, false);
    const afterEnumerationFailure = await store.load(fixture.root, policy.digest);
    assert.equal(afterEnumerationFailure.kind, "valid");
    if (afterEnumerationFailure.kind !== "valid") throw new Error("unreachable");
    assert.equal(afterEnumerationFailure.state.sequence, before.state.sequence);
    return {
      id: "enumeration-or-read-failure-is-incomplete",
      passed: true,
      ...resultRecord(enumerationFailure),
      facts: {
        ...basicFacts(enumerationFailure),
        readFailureIncomplete: true,
        enumerationFailureIncomplete: true,
        stateAdvancedOnFailure: false,
        partialCleanPublished: false,
      },
    };
  } finally {
    await fixture.dispose();
  }
};

const runDuplicateTriggers = async (): Promise<ScenarioRecord> => {
  const fixture = await createWorkspace("duplicate-triggers");
  try {
    const { store } = await baseline(fixture.root, fixture.stateDirectory);
    await writeFixtureFile(fixture.root, "src/duplicate.ts", "export const duplicate = true;\n");
    const first = await reconcile({ root: fixture.root, policy, store });
    const duplicate = await reconcile({ root: fixture.root, policy, store });
    assert.equal(first.changes.length, 1);
    assert.equal(duplicate.changes.length, 0);
    return {
      id: "duplicate-triggers-idempotent",
      passed: true,
      ...resultRecord(duplicate),
      facts: { ...basicFacts(duplicate), firstTriggerChanges: first.changes.length, duplicateChanges: 0 },
    };
  } finally {
    await fixture.dispose();
  }
};

const runRestartSemantics = async (): Promise<ScenarioRecord> => {
  const fixture = await createWorkspace("restart");
  try {
    const { store } = await baseline(fixture.root, fixture.stateDirectory);
    await writeFixtureFile(fixture.root, "src/restart.ts", "export const restart = 2;\n");
    const restartedStore = new ManifestStateStore(fixture.stateDirectory);
    const validRestart = await reconcile({ root: fixture.root, policy, store: restartedStore });
    assert.equal(validRestart.stateKind, "valid");
    assert.equal(validRestart.changes.length, 1);
    const statePath = await restartedStore.pathForRoot(fixture.root);
    await writeFile(statePath, "{ definitely not json", "utf8");
    await writeFixtureFile(fixture.root, "src/restart.ts", "export const restart = 3;\n");
    const corruptRestart = await reconcile({ root: fixture.root, policy, store: restartedStore });
    assert.equal(corruptRestart.status, "baseline_reset");
    assert.equal(corruptRestart.coverage, "unknown");
    assert.equal(corruptRestart.changes.length, 0);
    await writeFile(statePath, JSON.stringify({ schemaVersion: 99 }), "utf8");
    const incompatibleRestart = await reconcile({ root: fixture.root, policy, store: restartedStore });
    assert.equal(incompatibleRestart.status, "baseline_reset");
    assert.equal(incompatibleRestart.coverage, "unknown");
    assert.equal(incompatibleRestart.changes.length, 0);
    return {
      id: "valid-corrupt-and-incompatible-restart",
      passed: true,
      ...resultRecord(incompatibleRestart),
      facts: {
        ...basicFacts(incompatibleRestart),
        validRestartRecovered: true,
        corruptStateDidNotReconstructChanges: true,
        incompatibleStateDidNotReconstructChanges: true,
      },
    };
  } finally {
    await fixture.dispose();
  }
};

const runSeparateWorktrees = async (): Promise<ScenarioRecord> => {
  const fixture = await createWorkspace("separate-worktrees");
  let secondary: string | undefined;
  try {
    secondary = await createWorktree(fixture.root, "issue4-worktree");
    const store = new ManifestStateStore(fixture.stateDirectory);
    const first = await reconcile({ root: fixture.root, policy, store });
    const second = await reconcile({ root: secondary, policy, store });
    assert.equal(first.status, "baseline_seeded");
    assert.equal(second.status, "baseline_seeded");
    const firstPath = await store.pathForRoot(fixture.root);
    const secondPath = await store.pathForRoot(secondary);
    assert.notEqual(firstPath, secondPath);
    await writeFixtureFile(secondary, "src/tracked.ts", "export const tracked = 8;\n");
    const changedSecondary = await reconcile({ root: secondary, policy, store });
    const unchangedPrimary = await reconcile({ root: fixture.root, policy, store });
    assert.equal(changedSecondary.changes.length, 1);
    assert.equal(unchangedPrimary.changes.length, 0);
    return {
      id: "separate-worktree-state-identity",
      passed: true,
      ...resultRecord(changedSecondary),
      facts: {
        ...basicFacts(changedSecondary),
        distinctStateFiles: true,
        primaryUnaffected: unchangedPrimary.changes.length === 0,
      },
    };
  } finally {
    if (secondary !== undefined) removeWorktree(fixture.root, secondary);
    await fixture.dispose();
  }
};

const round = (value: number): number => Math.round(value * 100) / 100;

const benchmarkRecord = async (
  tree: string,
  files: number,
  phase: string,
  result: ReconcileResult,
  store: ManifestStateStore,
  root: string,
): Promise<BenchmarkRecord> => ({
  tree,
  files,
  phase,
  eligibleFiles: result.stats.eligibleFiles,
  bytesRead: result.stats.bytesRead,
  contentReads: result.stats.contentReads,
  stateBytes: await store.bytesForRoot(root),
  wallMs: round(result.stats.elapsedMs),
  cpuUserMs: round(result.stats.cpuUserMs),
  cpuSystemMs: round(result.stats.cpuSystemMs),
  changes: result.changes.length,
});

const createBenchmarkFiles = async (root: string, count: number): Promise<void> => {
  const directory = pathIn(root, "bench");
  await mkdir(directory, { recursive: true });
  const batchSize = 250;
  for (let start = 0; start < count; start += batchSize) {
    const batch: Promise<void>[] = [];
    for (let index = start; index < Math.min(start + batchSize, count); index += 1) {
      const name = `file-${String(index).padStart(5, "0")}.ts`;
      batch.push(writeFixtureFile(root, `bench/${name}`, `export const value${index} = ${index};\n`));
    }
    await Promise.all(batch);
  }
};

const runSyntheticBenchmark = async (count: number): Promise<ReadonlyArray<BenchmarkRecord>> => {
  const fixture = await createWorkspace(`benchmark-${count}`, { git: false });
  try {
    await createBenchmarkFiles(fixture.root, count);
    const store = new ManifestStateStore(fixture.stateDirectory);
    const cold = await reconcile({ root: fixture.root, policy, store });
    const warm = await reconcile({ root: fixture.root, policy, store });
    await writeFixtureFile(fixture.root, "bench/file-00000.ts", "export const value0 = 100000;\n");
    const oneFile = await reconcile({ root: fixture.root, policy, store });
    for (let index = 1; index <= 10; index += 1) {
      await writeFile(rootForBenchmarkFile(fixture.root, index), `export const value${index} = 100000;\n`, "utf8");
    }
    const multiFile = await reconcile({ root: fixture.root, policy, store });
    return [
      await benchmarkRecord(`synthetic-${count}`, count, "cold-baseline", cold, store, fixture.root),
      await benchmarkRecord(`synthetic-${count}`, count, "warm-no-change", warm, store, fixture.root),
      await benchmarkRecord(`synthetic-${count}`, count, "one-file-change", oneFile, store, fixture.root),
      await benchmarkRecord(`synthetic-${count}`, count, "multi-file-change", multiFile, store, fixture.root),
    ];
  } finally {
    await fixture.dispose();
  }
};

const rootForBenchmarkFile = (root: string, index: number): string => {
  return pathIn(root, `bench/file-${String(index).padStart(5, "0")}.ts`);
};

const runActualRepoBenchmark = async (): Promise<ReadonlyArray<BenchmarkRecord>> => {
  const root = process.cwd();
  const stateDirectory = await mkdtemp(join(tmpdir(), "jev-issue4-state-actual-"));
  try {
    const store = new ManifestStateStore(stateDirectory);
    const cold = await reconcile({ root, policy, store });
    const warm = await reconcile({ root, policy, store });
    return [
      await benchmarkRecord("actual-repository", cold.stats.eligibleFiles, "cold-baseline", cold, store, root),
      await benchmarkRecord("actual-repository", warm.stats.eligibleFiles, "warm-no-change", warm, store, root),
    ];
  } finally {
    await rm(stateDirectory, { recursive: true, force: true });
  }
};

const runAll = async (): Promise<{
  readonly scenarios: ReadonlyArray<ScenarioRecord>;
  readonly benchmarks: ReadonlyArray<BenchmarkRecord>;
}> => {
  const scenarioFunctions: ReadonlyArray<() => Promise<ScenarioRecord>> = [
    runDirtyStart,
    runNetChanges,
    runIgnoredAndExcluded,
    runMixedExtensionExclusion,
    runExactRevert,
    runSymlinkAndNonregular,
    runMutationDuringRead,
    runMutationDuringDirectoryTraversal,
    runFailureSemantics,
    runDuplicateTriggers,
    runRestartSemantics,
    runSeparateWorktrees,
  ];
  const scenarios: ScenarioRecord[] = [];
  for (const run of scenarioFunctions) {
    const id = run.name.replace(/^run/, "").replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`).replace(/^-/, "");
    try {
      scenarios.push(await run());
    } catch (error) {
      if (process.argv.includes("--debug")) {
        console.error(`${id}: ${error instanceof Error ? error.message : "unknown failure"}`);
      }
      scenarios.push({ id, passed: false, facts: { assertionFailed: true } });
    }
  }
  const benchmarks = [
    ...(await runActualRepoBenchmark()),
    ...(await runSyntheticBenchmark(1_000)),
    ...(await runSyntheticBenchmark(10_000)),
  ];
  return { scenarios, benchmarks };
};

const writeEvidence = async (
  report: Awaited<ReturnType<typeof runAll>>,
): Promise<void> => {
  const directory = new URL("./evidence/", import.meta.url);
  const records = report.scenarios.map((record) => JSON.stringify(record)).join("\n") + "\n";
  const failed = report.scenarios.filter((scenario) => !scenario.passed);
  const summary = `${JSON.stringify({
    schemaVersion: 2,
    experiment: "shell-write-detection",
    sourceFree: true,
    replay: {
      environment: {
        node: process.version,
        git: commandVersion("git", ["--version"]),
        os: os.type(),
        osVersion: os.version(),
        platform: process.platform,
        arch: process.arch,
        kernel: os.release(),
      },
      command: evidenceCommand,
      config: {
        basePolicy: policy,
        partialExclusionPolicy,
        syntheticBenchmarkFileCounts: [1_000, 10_000],
        actualRepositoryBenchmark: true,
        sourceFreeEvidence: true,
      },
      expectedOutcome: {
        allScenariosPass: true,
        concurrentDirectoryAddIsIncomplete: true,
        mixedExtensionExclusionReadsNoExcludedType: true,
        noSourceBytesRetained: true,
      },
      observedOutcome: {
        allScenariosPassed: failed.length === 0,
        scenarioCount: report.scenarios.length,
        passedCount: report.scenarios.length - failed.length,
        failedScenarioIds: failed.map((scenario) => scenario.id),
        benchmarkRowCount: report.benchmarks.length,
      },
      exitStatus: failed.length === 0 ? 0 : 1,
      retainedPaths: [
        "experiments/shell-write-detection/evidence/records.jsonl",
        "experiments/shell-write-detection/evidence/summary.json",
        "experiments/shell-write-detection/evidence/README.txt",
      ],
      benchmarkInterpretation:
        "Benchmark rows are one observational sample per phase on the replay host, not a statistical latency guarantee.",
      unavailableScope: [
        "multiprocess state locking and cross-process idempotence",
        "writes during host review or after the final tree-stability boundary",
        "full product policy and consent-layer fidelity; only the captured experiment policy is exercised",
        "oversized files and maxFiles/maxBytes over-budget behavior",
      ],
    },
    scenarios: report.scenarios,
    benchmarks: report.benchmarks,
  }, null, 2)}\n`;
  if (records.includes(SENTINEL) || summary.includes(SENTINEL)) {
    throw new Error("sanitized evidence unexpectedly contains fixture sentinel");
  }
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("records.jsonl", directory), records, "utf8");
  await writeFile(new URL("summary.json", directory), summary, "utf8");
  // A path-only proof file makes the retention boundary explicit without
  // copying any fixture bytes into the experiment evidence.
  await writeFile(
    new URL("README.txt", directory),
    "Sanitized issue-4 prototype evidence; no source bytes retained. summary.json records replay metadata, expected/observed outcomes, retained paths, benchmark interpretation, and unavailable scope.\n",
    "utf8",
  );
};

const report = await runAll();
if (process.argv.includes("--write-evidence")) await writeEvidence(report);
const failed = report.scenarios.filter((scenario) => !scenario.passed);
console.log(JSON.stringify({
  experiment: "shell-write-detection",
  scenarios: report.scenarios.length,
  passed: report.scenarios.length - failed.length,
  failed: failed.map((scenario) => scenario.id),
  benchmarkRows: report.benchmarks.length,
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
