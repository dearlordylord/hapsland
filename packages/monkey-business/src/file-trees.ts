import { initialImportGraph, projectImportGraph, stepImportGraph, type ImportGraphEvent } from "../../../src/canonical/graph-adapter.ts";

export type FileTreeProfile = Readonly<{
  minFiles: number; maxFiles: number; maxImports: number; maxDepth: number;
  deniedPercent: number;
  minSourceBytes: number; maxSourceBytes: number;
  minTreeBytes: number; maxTreeBytes: number;
}>;
export const DEFAULT_FILE_TREE_PROFILE: FileTreeProfile = Object.freeze({
  minFiles: 3, maxFiles: 8, maxImports: 3, maxDepth: 3, deniedPercent: 15,
  minSourceBytes: 512, maxSourceBytes: 4096, minTreeBytes: 256, maxTreeBytes: 2048,
});
export const FILE_TREE_LABELS: Readonly<Record<keyof FileTreeProfile, string>> = Object.freeze({
  minFiles: "Minimum generated files", maxFiles: "Maximum generated files", maxImports: "Maximum imports per file", maxDepth: "Maximum import depth", deniedPercent: "Denied import targets (%)",
  minSourceBytes: "Minimum source bytes per file", maxSourceBytes: "Maximum source bytes per file", minTreeBytes: "Minimum evidence-tree bytes per file", maxTreeBytes: "Maximum evidence-tree bytes per file",
});
export const validateFileTreeProfile = (profile: FileTreeProfile): FileTreeProfile => {
  if (!profile || typeof profile !== "object") throw new TypeError("file tree profile must be an object");
  const bounds: Record<keyof FileTreeProfile, readonly [number, number]> = {
    minFiles: [1, 64], maxFiles: [1, 64], maxImports: [0, 16], maxDepth: [0, 12], deniedPercent: [0, 100],
    minSourceBytes: [1, 1048576], maxSourceBytes: [1, 1048576], minTreeBytes: [1, 1048576], maxTreeBytes: [1, 1048576],
  };
  for (const key of Object.keys(bounds) as (keyof FileTreeProfile)[]) {
    const [min, max] = bounds[key];
    if (!Number.isSafeInteger(profile[key]) || profile[key] < min || profile[key] > max)
      throw new RangeError(`${FILE_TREE_LABELS[key]} must be an integer in [${min}, ${max}]`);
  }
  for (const [min, max] of [["minFiles", "maxFiles"], ["minSourceBytes", "maxSourceBytes"], ["minTreeBytes", "maxTreeBytes"]] as const)
    if (profile[min] > profile[max]) throw new RangeError(`${FILE_TREE_LABELS[min]} must not exceed ${FILE_TREE_LABELS[max].toLowerCase()}`);
  let capacity = 1, level = 1;
  for (let depth = 1; depth <= profile.maxDepth && capacity < 64; depth++) {
    level *= profile.maxImports;
    capacity += level;
  }
  if (profile.maxFiles > capacity) throw new RangeError(`Maximum files exceeds branching/depth capacity (${capacity} files)`);
  return Object.freeze({ ...profile });
};
export type GeneratedFile = Readonly<{ target: number; name: string; depth: number; allowed: boolean; sourceBytes: number; treeBytes: number; edges: readonly number[] }>;
export type GeneratedTree = Readonly<{ files: readonly GeneratedFile[]; facts: readonly ImportGraphEvent[]; targetNames: Readonly<Record<number, string>>; depth: number }>;

/** Dedicated per-artifact stream: unrelated Jev draws and playback do not consume it. */
export const generateFileTree = (seed: number, operation: number, unit: number, input: FileTreeProfile = DEFAULT_FILE_TREE_PROFILE): GeneratedTree => {
  for (const [name, value] of [["seed", seed], ["operation", operation], ["artifact index", unit]] as const)
    if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** 48) throw new RangeError(`${name} must be a nonnegative safe graph integer`);
  const profile = validateFileTreeProfile(input);
  let randomState = (seed >>> 0) ^ Math.floor(seed / 2 ** 32);
  for (const char of `import-trees:${operation}:${unit}`) randomState = Math.imul(randomState ^ char.charCodeAt(0), 16777619) >>> 0;
  randomState ||= 1;
  const draw = () => {
    randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
    randomState >>>= 0;
    return randomState / 2 ** 32;
  };
  const between = (min: number, max: number) => min + Math.floor(draw() * (max - min + 1));
  const count = between(profile.minFiles, profile.maxFiles);
  const files: (Omit<GeneratedFile, "edges"> & { edges: number[] })[] = [];
  const makeFile = (target: number, depth: number) => ({ target, name: target === 1 ? "entry.ts" : `module-${target}.ts`, depth,
    allowed: target === 1 || draw() * 100 >= profile.deniedPercent,
    sourceBytes: between(profile.minSourceBytes, profile.maxSourceBytes), treeBytes: between(profile.minTreeBytes, profile.maxTreeBytes), edges: [] as number[] });
  files.push(makeFile(1, 0));
  for (let target = 2; target <= count; target++) {
    const candidates = files.filter(file => file.depth < profile.maxDepth && file.edges.length < profile.maxImports);
    const parent = candidates[between(0, candidates.length - 1)]!;
    parent.edges.push(target); // Synthetic edge IDs resolve to the same numeric target.
    files.push(makeFile(target, parent.depth + 1));
  }
  // Native orchestration follows checked commands; only Bend decides traversal and budgets.
  let state = initialImportGraph();
  const facts: ImportGraphEvent[] = [];
  let fact: ImportGraphEvent = { kind: "root", target: 1, sourceBytes: files[0]!.sourceBytes, treeBytes: files[0]!.treeBytes, edges: files[0]!.edges };
  while (facts.length < 512) {
    facts.push(fact);
    const result = stepImportGraph(state, fact);
    state = result.state;
    const phase = projectImportGraph(state).phase;
    if (phase === "complete" || phase === "incomplete") return {
      files, facts, targetNames: Object.fromEntries(files.map(file => [file.target, file.name])), depth: Math.max(...files.map(file => file.depth)),
    };
    switch (result.command.kind) {
      case "resolveEdge": fact = { kind: "resolved", target: result.command.edge, result: "found" }; break;
      case "checkPath": fact = { kind: "pathChecked", allowed: files[result.command.target - 1]!.allowed }; break;
      case "readSource": {
        const file = files[result.command.target - 1]!;
        fact = { kind: "captured", sourceBytes: file.sourceBytes, treeBytes: file.treeBytes, edges: file.edges }; break;
      }
      default: fact = { kind: "next" };
    }
  }
  throw new Error("generated import tree did not reach a checked terminal state");
};
