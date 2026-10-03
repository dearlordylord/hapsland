import { lstat } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  sep,
} from "node:path";
import * as Effect from "effect/Effect";
import { parse } from "smol-toml";
import {
  initialImportGraph,
  projectImportGraph,
  stepImportGraph,
} from "../../canonical/graph-adapter.ts";
import type { GraphLimits } from "../../configuration/graph-limits.ts";
import { inspectRustModules, type GraphInspectionOptions } from "./rust.ts";
import { captureStable, type StableCapture } from "../capture.ts";
import { eligibleNamedPath } from "../selection.ts";
import type { LanguageGraphHost } from "./contracts.ts";

type Route = {
  readonly path: string;
  readonly cratePath: string;
  readonly crateModules?: ReadonlyMap<string, string>;
  readonly depth: number;
};
type Task = { readonly path: string; readonly route?: Route };
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const within = (path: string): boolean =>
  path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
const moduleDirectory = (path: string, cratePath: string): string =>
  path === cratePath || basename(path) === "mod.rs"
    ? dirname(path)
    : join(dirname(path), basename(path, ".rs"));

type CargoFields = Record<string, unknown>;
const relativeRustTarget = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && !isAbsolute(value);
const supportedCargoPackage = (pkg: CargoFields | undefined): pkg is CargoFields =>
  pkg !== undefined && typeof pkg.name === "string" && pkg.name.length > 0 &&
  typeof pkg.edition === "string" && ["2018", "2021", "2024"].includes(pkg.edition);
const unsupportedCargoSelection = (manifest: CargoFields, pkg: CargoFields, selected: string): boolean =>
  ["test", "example", "bench"].some((kind) => manifest[kind] !== undefined) ||
  (pkg.build !== undefined && pkg.build !== false) || selected === "build.rs" ||
  ["tests", "examples", "benches"].some((kind) => selected === kind || selected.startsWith(`${kind}${sep}`)) ||
  ["autolib", "autobins"].some((flag) => pkg[flag] !== undefined && typeof pkg[flag] !== "boolean");
const cargoLibraryRoots = (manifest: CargoFields, pkg: CargoFields, base: string): string[] | undefined => {
  const lib = record(manifest.lib);
  if (!supportedCargoLibrary(manifest, lib)) return undefined;
  return lib !== undefined || pkg.autolib !== false
    ? [join(base, typeof lib?.path === "string" ? lib.path : "src/lib.rs")]
    : [];
};
const cargoAutomaticBinaryRoots = (manifest: CargoFields, pkg: CargoFields, base: string, path: string): string[] =>
  pkg.autobins !== false && manifest.bin === undefined
    ? [join(base, "src/main.rs"), ...automaticBinaryCandidate(base, path)] : [];
const namedCargoBinary = (bin: CargoFields | undefined, names: ReadonlySet<string>): bin is CargoFields & { readonly path: string; readonly name: string } =>
  bin !== undefined && relativeRustTarget(bin.path) && typeof bin.name === "string" && bin.name.length > 0 &&
  !names.has(bin.name) && bin.edition === undefined;
const cargoExplicitBinaryRoots = (manifest: CargoFields, base: string, fileLimit: number): string[] | undefined => {
  if (manifest.bin === undefined) return [];
  if (!Array.isArray(manifest.bin) || manifest.bin.length > fileLimit) return undefined;
  const roots: string[] = [];
  const names = new Set<string>();
  for (const value of manifest.bin) {
    const bin = record(value);
    if (!namedCargoBinary(bin, names)) return undefined;
    names.add(bin.name);
    roots.push(join(base, bin.path));
  }
  return roots;
};
const cargoManifest = (source: string): CargoFields | undefined => {
  try { return record(parse(source)); } catch { return undefined; }
};
const cargoTargetRoots = (taskPath: string, source: string, path: string, fileLimit: number): string[] | undefined => {
  const manifest = cargoManifest(source);
  const pkg = record(manifest?.package);
  if (manifest === undefined || !supportedCargoPackage(pkg)) return undefined;
  const base = dirname(taskPath);
  if (unsupportedCargoSelection(manifest, pkg, relative(base, path))) return undefined;
  const libraries = cargoLibraryRoots(manifest, pkg, base);
  if (libraries === undefined) return undefined;
  const binaries = cargoExplicitBinaryRoots(manifest, base, fileLimit);
  if (binaries === undefined) return undefined;
  const roots = [...libraries, ...cargoAutomaticBinaryRoots(manifest, pkg, base, path), ...binaries];
  // Cargo absolute targets and source paths outside the selected repository cannot establish a local module role.
  return roots.some((root) => !within(root) || extname(root) !== ".rs") ? undefined : roots;
};

const nearestCargoManifest = Effect.fn("DirectEvent.nearestCargoManifest")(function* (path: string, root: string) {
  let directory = dirname(path);
  for (let depth = 0; depth < 16; depth++) {
    const candidate = join(directory, "Cargo.toml");
    const stat = yield* Effect.promise(() =>
      lstat(join(root, candidate)).catch(() => undefined),
    );
    if (stat !== undefined) {
      return candidate;
    }
    if (directory === ".") break;
    directory = dirname(directory);
  }
  return undefined;
});

const supportedCargoLibrary = (manifest: CargoFields, lib: CargoFields | undefined): boolean => {
  if ((manifest.lib !== undefined && lib === undefined) || lib?.edition !== undefined) return false;
  return lib?.path === undefined || relativeRustTarget(lib.path);
};
const automaticBinaryCandidate = (base: string, path: string): string[] => {
  const tail = relative(join(base, "src/bin"), path);
  if (!within(tail) || tail === "") return [];
  const first = tail.split(sep)[0];
  if (first === undefined) return [];
  return [join(base, "src/bin", first.endsWith(".rs") ? first : join(first, "main.rs"))];
};
const declaredChildModule = (base: string, path: string, moduleNames: readonly string[]): string | undefined => {
  const tail = relative(base, path);
  if (!within(tail)) return undefined;
  const first = tail.split(sep)[0];
  if (first === undefined) return undefined;
  const name = first.endsWith(".rs") ? first.slice(0, -3) : first;
  return moduleNames.includes(name) ? name : undefined;
};
const moduleInspectionRole = (path: string, cratePath: string, crateModules: ReadonlyMap<string, string>): GraphInspectionOptions => ({
  ...(path === cratePath ? { rustCrateRoot: true } : { rustExternalModule: true }),
  rustCrateModules: new Map([...crateModules].map(([name, target]) => [name, relative(dirname(path), target) || "."])),
});
const uniqueModuleRole = (invalid: boolean, commandKind: string, roles: readonly GraphInspectionOptions[]): GraphInspectionOptions | undefined =>
  !invalid && commandKind === "unitComplete" && roles.length === 1 ? roles[0] : undefined;

const crateModulePaths = (route: Route, names: readonly string[]): ReadonlyMap<string, string> =>
  route.crateModules ?? new Map(names.map((name) => [name, join(dirname(route.cratePath), name)]));
const uniqueModuleCandidate = (choices: readonly string[]): string | undefined => choices.length === 1 ? choices[0] : undefined;

const inspectBoundedRustRoute = (route: Route, source: string, maxDepth: number): ReturnType<typeof inspectRustModules> =>
  route.depth > maxDepth ? undefined : inspectRustModules(source);

/** Cargo and mod links are binding evidence, not compiler execution. */
export const resolveRustModuleContext = Effect.fn(
  "DirectEvent.resolveRustModuleContext",
)(function* (
  path: string,
  rootCapture: StableCapture,
  context: LanguageGraphHost,
  limits: GraphLimits,
  expired: () => boolean,
) {
  const captures = context.captureCache ?? new Map<string, StableCapture>();
  captures.set(path, rootCapture);
  const dependencies = new Set<string>();
  const roles: GraphInspectionOptions[] = [];
  const tasks = new Map<number, Task>();
  const targets = new Map<string, number>([[path, 1]]);
  let nextEdge = 1;
  let nextTarget = 2;
  let active: Task | undefined;
  let invalid = false;
  const edges = (items: readonly Task[]): number[] =>
    items.map((task) => {
      const id = nextEdge++;
      tasks.set(id, task);
      return id;
    });
  const cargo = yield* nearestCargoManifest(path, context.root);
  let state = initialImportGraph(limits);
  let transition = stepImportGraph(state, {
    kind: "root",
    target: 1,
    sourceBytes: rootCapture.byteLength,
    treeBytes: 0,
    edges: cargo === undefined ? [] : edges([{ path: cargo }]),
  });
  state = transition.state;
  let command = transition.command;

  const existing = Effect.fn("DirectEvent.rustModuleCandidates")(function* (
    paths: readonly string[],
  ) {
    const found: string[] = [];
    for (const candidate of paths) {
      if (!within(candidate)) continue;
      const stat = yield* Effect.promise(() =>
        lstat(join(context.root, candidate)).catch(() => undefined),
      );
      if (stat?.isFile()) found.push(candidate);
    }
    return found;
  });
  const follow = Effect.fn("DirectEvent.rustModuleLink")(function* (
    route: Route,
    source: string,
  ): Effect.fn.Return<readonly Task[]> {
    const modules = inspectBoundedRustRoute(route, source, limits.depth);
    if (modules === undefined) {
      invalid = true;
      return [];
    }
    const crateModules = crateModulePaths(route, modules.names);
    if (route.path === path) {
      roles.push(moduleInspectionRole(path, route.cratePath, crateModules));
      return [];
    }
    const base = moduleDirectory(route.path, route.cratePath);
    const name = declaredChildModule(base, path, modules.names);
    if (name === undefined) return [];
    const choices = yield* existing([
      join(base, `${name}.rs`),
      join(base, name, "mod.rs"),
    ]);
    const chosen = uniqueModuleCandidate(choices);
    if (chosen === undefined) { invalid = true; return []; }
    const next = {
      path: chosen,
      cratePath: route.cratePath,
      crateModules,
      depth: route.depth + 1,
    };
    if (chosen === path) return yield* follow(next, rootCapture.text);
    return [{ path: chosen, route: next }];
  });
  const afterCapture = Effect.fn("DirectEvent.rustBindingFacts")(function* (
    task: Task,
    source: string,
  ): Effect.fn.Return<readonly Task[]> {
    if (task.route !== undefined) return yield* follow(task.route, source);
    const roots = cargoTargetRoots(task.path, source, path, limits.files);
    if (roots === undefined) {
      invalid = true;
      return [];
    }
    const candidates = yield* existing([
      ...new Set(roots.map((root) => normalize(root))),
    ]);
    const pending: Task[] = [];
    for (const candidate of candidates) {
      const route = { path: candidate, cratePath: candidate, depth: 0 };
      if (candidate === path)
        pending.push(...(yield* follow(route, rootCapture.text)));
      else if (within(relative(dirname(candidate), path)))
        pending.push({ path: candidate, route });
    }
    return pending;
  });
  const captureBudgetAvailable = (selectedPath: string): boolean => captures.has(selectedPath) ||
    (captures.size < 64 && [...captures.values()].reduce((sum, capture) => sum + capture.byteLength, 0) + limits.sourceBytes <= 16 * 1024 * 1024);
  const resolveEdge = (edge: number) => {
      active = tasks.get(edge);
      if (active === undefined || !within(active.path)) {
        return undefined;
      }
      const target = targets.get(active.path) ?? nextTarget++;
      targets.set(active.path, target);
      // A second crate path reaching the same source is an ambiguous role.
      if (dependencies.has(active.path)) {
        return undefined;
      }
      return stepImportGraph(state, {
        kind: "resolved",
        target,
        result: "found",
      });
  };
  const checkPath = Effect.fn("DirectEvent.rustCheckPath")(function* () {
      if (active === undefined) {
        return undefined;
      }
      const selected = yield* eligibleNamedPath(
        context.root,
        active.path,
        context.policy,
        context.rootIdentity,
      );
      return stepImportGraph(state, {
        kind: "pathChecked",
        allowed: selected !== undefined,
      });
  });
  const captureSelectedModule = Effect.fn("DirectEvent.captureSelectedRustModule")(function* (selected: NonNullable<Effect.Success<ReturnType<typeof eligibleNamedPath>>>) {
      let capture = captures.get(selected.relativePath);
      if (capture === undefined) {
        capture = yield* (context.captureSource ?? captureStable)(
          context.root,
          selected,
          context.captureHooks,
          context.rootIdentity,
          limits.sourceBytes,
        );
        if (capture !== undefined) captures.set(selected.relativePath, capture);
      }
      return capture;
  });
  const readSource = Effect.fn("DirectEvent.rustReadSource")(function* () {
      if (active === undefined) {
        return undefined;
      }
      const selected = yield* eligibleNamedPath(
        context.root,
        active.path,
        context.policy,
        context.rootIdentity,
      );
      if (selected === undefined || !captureBudgetAvailable(selected.relativePath)) return undefined;
      const capture = yield* captureSelectedModule(selected);
      if (capture === undefined || capture.byteLength > limits.sourceBytes) {
        return undefined;
      }
      dependencies.add(selected.relativePath);
      const pending = yield* afterCapture(active, capture.text);
      return stepImportGraph(state, {
        kind: "captured",
        sourceBytes: capture.byteLength,
        treeBytes: 0,
        edges: edges(pending),
      });
  });
  const executeCommand = Effect.fn("DirectEvent.rustGraphCommand")(function* () {
    switch (command.kind) {
      case "none": return stepImportGraph(state, { kind: "next" });
      case "resolveEdge": return resolveEdge(command.edge);
      case "checkPath": return yield* checkPath();
      case "readSource": return yield* readSource();
      default: return undefined;
    }
  });
  for (let iteration = 0; iteration < limits.work * 8 + 16; iteration++) {
    if (expired()) { invalid = true; break; }
    if (command.kind === "unitComplete") break;
    const next = yield* executeCommand();
    if (next === undefined) { invalid = true; break; }
    state = next.state;
    command = next.command;
  }
  const spent = projectImportGraph(state);
  const remaining = {
    ...limits,
    files: limits.files - Math.max(0, spent.files - 1),
    readBytes:
      limits.readBytes - Math.max(0, spent.readBytes - rootCapture.byteLength),
    work: limits.work - spent.work,
  };
  return {
    options:
      uniqueModuleRole(invalid, command.kind, roles),
    dependencies: [...dependencies].sort(),
    remaining,
  };
});
