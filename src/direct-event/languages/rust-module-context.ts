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
  let cargo: string | undefined;
  let directory = dirname(path);
  for (let depth = 0; depth < 16; depth++) {
    const candidate = join(directory, "Cargo.toml");
    const stat = yield* Effect.promise(() =>
      lstat(join(context.root, candidate)).catch(() => undefined),
    );
    if (stat !== undefined) {
      cargo = candidate;
      break;
    }
    if (directory === ".") break;
    directory = dirname(directory);
  }
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
    if (route.depth > limits.depth) {
      invalid = true;
      return [];
    }
    const modules = inspectRustModules(source);
    if (modules === undefined) {
      invalid = true;
      return [];
    }
    const crateModules =
      route.crateModules ??
      new Map(
        modules.names.map((name) => [
          name,
          join(dirname(route.cratePath), name),
        ]),
      );
    if (route.path === path) {
      roles.push({
        ...(path === route.cratePath
          ? { rustCrateRoot: true }
          : { rustExternalModule: true }),
        rustCrateModules: new Map(
          [...crateModules].map(([name, target]) => [
            name,
            relative(dirname(path), target) || ".",
          ]),
        ),
      });
      return [];
    }
    const base = moduleDirectory(route.path, route.cratePath);
    const tail = relative(base, path);
    if (!within(tail)) return [];
    const first = tail.split(sep)[0];
    if (first === undefined) return [];
    const name = first.endsWith(".rs") ? first.slice(0, -3) : first;
    if (!modules.names.includes(name)) return [];
    const choices = yield* existing([
      join(base, `${name}.rs`),
      join(base, name, "mod.rs"),
    ]);
    if (choices.length !== 1) {
      invalid = true;
      return [];
    }
    const chosen = choices[0];
    if (chosen === undefined) return [];
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
    let manifest: Record<string, unknown> | undefined;
    try {
      manifest = record(parse(source));
    } catch {
      invalid = true;
      return [];
    }
    const pkg = record(manifest?.package);
    if (
      pkg === undefined ||
      typeof pkg.name !== "string" ||
      pkg.name.length === 0 ||
      typeof pkg.edition !== "string" ||
      !["2018", "2021", "2024"].includes(pkg.edition)
    ) {
      invalid = true;
      return [];
    }
    const base = dirname(task.path);
    const selected = relative(base, path);
    if (
      ["test", "example", "bench"].some(
        (kind) => manifest?.[kind] !== undefined,
      ) ||
      (pkg.build !== undefined && pkg.build !== false) ||
      selected === "build.rs" ||
      ["tests", "examples", "benches"].some(
        (kind) => selected === kind || selected.startsWith(`${kind}${sep}`),
      ) ||
      ["autolib", "autobins"].some(
        (flag) => pkg[flag] !== undefined && typeof pkg[flag] !== "boolean",
      )
    ) {
      invalid = true;
      return [];
    }
    const roots: string[] = [];
    const lib = record(manifest?.lib);
    if (
      (manifest?.lib !== undefined && lib === undefined) ||
      lib?.edition !== undefined
    ) {
      invalid = true;
      return [];
    }
    if (
      lib !== undefined &&
      lib.path !== undefined &&
      (typeof lib.path !== "string" ||
        lib.path.length === 0 ||
        isAbsolute(lib.path))
    ) {
      invalid = true;
      return [];
    }
    if (lib !== undefined || pkg.autolib !== false)
      roots.push(
        join(base, typeof lib?.path === "string" ? lib.path : "src/lib.rs"),
      );
    if (pkg.autobins !== false && manifest?.bin === undefined) {
      roots.push(join(base, "src/main.rs"));
      const tail = relative(join(base, "src/bin"), path);
      if (within(tail) && tail !== "") {
        const first = tail.split(sep)[0];
        if (first !== undefined)
          roots.push(
            join(
              base,
              "src/bin",
              first.endsWith(".rs") ? first : join(first, "main.rs"),
            ),
          );
      }
    }
    if (manifest?.bin !== undefined) {
      if (!Array.isArray(manifest.bin) || manifest.bin.length > limits.files) {
        invalid = true;
        return [];
      }
      const names = new Set<string>();
      for (const value of manifest.bin) {
        const bin = record(value);
        if (
          typeof bin?.path !== "string" ||
          bin.path.length === 0 ||
          isAbsolute(bin.path) ||
          typeof bin.name !== "string" ||
          bin.name.length === 0 ||
          names.has(bin.name) ||
          bin.edition !== undefined
        ) {
          invalid = true;
          return [];
        }
        names.add(bin.name);
        roots.push(join(base, bin.path));
      }
    }
    // Cargo absolute targets and source paths outside the selected repository
    // cannot establish a local module role.
    if (roots.some((root) => !within(root) || extname(root) !== ".rs")) {
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
  for (let iteration = 0; iteration < limits.work * 8 + 16; iteration++) {
    if (expired()) {
      invalid = true;
      break;
    }
    if (command.kind === "unitComplete") break;
    if (command.kind === "unitIncomplete" || command.kind === "skipImport") {
      invalid = true;
      break;
    }
    if (command.kind === "none")
      transition = stepImportGraph(state, { kind: "next" });
    else if (command.kind === "resolveEdge") {
      active = tasks.get(command.edge);
      if (active === undefined || !within(active.path)) {
        invalid = true;
        break;
      }
      const target = targets.get(active.path) ?? nextTarget++;
      targets.set(active.path, target);
      // A second crate path reaching the same source is an ambiguous role.
      if (dependencies.has(active.path)) {
        invalid = true;
        break;
      }
      transition = stepImportGraph(state, {
        kind: "resolved",
        target,
        result: "found",
      });
    } else if (command.kind === "checkPath") {
      if (active === undefined) {
        invalid = true;
        break;
      }
      const selected = yield* eligibleNamedPath(
        context.root,
        active.path,
        context.policy,
        context.rootIdentity,
      );
      transition = stepImportGraph(state, {
        kind: "pathChecked",
        allowed: selected !== undefined,
      });
    } else if (command.kind === "readSource") {
      if (active === undefined) {
        invalid = true;
        break;
      }
      const selected = yield* eligibleNamedPath(
        context.root,
        active.path,
        context.policy,
        context.rootIdentity,
      );
      if (
        selected === undefined ||
        (!captures.has(selected.relativePath) &&
          (captures.size >= 64 ||
            [...captures.values()].reduce(
              (sum, capture) => sum + capture.byteLength,
              0,
            ) +
              limits.sourceBytes >
              16 * 1024 * 1024))
      ) {
        invalid = true;
        break;
      }
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
      if (capture === undefined || capture.byteLength > limits.sourceBytes) {
        invalid = true;
        break;
      }
      dependencies.add(selected.relativePath);
      const pending = yield* afterCapture(active, capture.text);
      transition = stepImportGraph(state, {
        kind: "captured",
        sourceBytes: capture.byteLength,
        treeBytes: 0,
        edges: edges(pending),
      });
    } else {
      invalid = true;
      break;
    }
    state = transition.state;
    command = transition.command;
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
      !invalid && command.kind === "unitComplete" && roles.length === 1
        ? roles[0]
        : undefined,
    dependencies: [...dependencies].sort(),
    remaining,
  };
});
