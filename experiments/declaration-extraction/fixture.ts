import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { exactRange, positionAtByte, type ByteRange } from "./source.ts";
import type { LspRange } from "./protocol.ts";

export type TraversalCaps = {
  declarations: number;
  depth: number;
  sourceCharacters: number;
  files: number;
  externalPackages: number;
  elapsedMs: number;
};

export type EditSpec = {
  path: string;
  beforeRange?: LspRange;
  afterRange?: LspRange;
  range?: LspRange;
};

export type FixtureManifest = {
  name?: string;
  workspace?: string;
  before?: string;
  evaluationMarker?: string;
  edit?: EditSpec;
  edits?: Record<string, EditSpec>;
  defaultEdit?: string;
  caps?: Partial<TraversalCaps>;
};

export type SelectedEdit = {
  name: string;
  path: string;
  beforeText: string;
  afterText: string;
  beforeRange: LspRange;
  afterRange: LspRange;
  beforeBytes: ByteRange;
  afterBytes: ByteRange;
  diff: string;
};

export type Fixture = {
  root: string;
  workspaceRoot: string;
  manifest: FixtureManifest;
  paths: string[];
  edit: SelectedEdit;
  caps: TraversalCaps;
  markerPath?: string;
};

export const DEFAULT_CAPS: TraversalCaps = {
  declarations: 32,
  depth: 3,
  sourceCharacters: 20_000,
  files: 32,
  externalPackages: 4,
  elapsedMs: 4_000,
};

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as FixtureManifest;

const filesUnder = (root: string, prefix = ""): string[] => {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(root, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return filesUnder(path, relativePath);
      return [relativePath];
    });
};

const asRange = (value: unknown): LspRange | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const range = value as { start?: unknown; end?: unknown };
  const position = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return undefined;
    const position = candidate as { line?: unknown; character?: unknown };
    if (!Number.isInteger(position.line) || !Number.isInteger(position.character)) return undefined;
    return { line: Number(position.line), character: Number(position.character) };
  };
  const start = position(range.start);
  const end = position(range.end);
  return start && end ? { start, end } : undefined;
};

const changedByteRange = (before: string, after: string) => {
  let prefix = 0;
  const limit = Math.min(before.length, after.length);
  while (prefix < limit && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix += 1;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (
    beforeEnd > prefix &&
    afterEnd > prefix &&
    before.charCodeAt(beforeEnd - 1) === after.charCodeAt(afterEnd - 1)
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return {
    before: {
      start: Buffer.byteLength(before.slice(0, prefix), "utf8"),
      end: Buffer.byteLength(before.slice(0, beforeEnd), "utf8"),
    },
    after: {
      start: Buffer.byteLength(after.slice(0, prefix), "utf8"),
      end: Buffer.byteLength(after.slice(0, afterEnd), "utf8"),
    },
  };
};

const rangeForBytes = (source: string, bytes: ByteRange): LspRange => ({
  start: positionAtByte(source, bytes.start),
  end: positionAtByte(source, bytes.end),
});

const diff = (path: string, before: string, after: string) => {
  const oldLines = before.split(/(?<=\n)/);
  const newLines = after.split(/(?<=\n)/);
  const output = [`--- before/${path}`, `+++ after/${path}`];
  const changed = changedByteRange(before, after);
  const beforePrefix = before.slice(0, Buffer.byteLength(before.slice(0, 0), "utf8"));
  void beforePrefix;
  // This compact diff intentionally keeps complete old/new line content. It is
  // deterministic and preserves the actual edit without depending on a diff
  // package or a platform-specific command.
  for (const line of oldLines) output.push(`-${line.replace(/\n$/, "")}`);
  for (const line of newLines) output.push(`+${line.replace(/\n$/, "")}`);
  output.push(
    `@@ bytes ${changed.before.start}-${changed.before.end} -> ${changed.after.start}-${changed.after.end} @@`,
  );
  return output.join("\n");
};

const parseInlineEdit = (value: string): EditSpec | undefined => {
  const match = /^(.*?):(\d+):(\d+)-(\d+):(\d+)$/.exec(value);
  if (!match) return undefined;
  return {
    path: match[1] as string,
    range: {
      start: { line: Number(match[2]), character: Number(match[3]) },
      end: { line: Number(match[4]), character: Number(match[5]) },
    },
  };
};

const selectedSpec = (manifest: FixtureManifest, requested?: string) => {
  if (requested && parseInlineEdit(requested)) {
    return { name: "inline", spec: parseInlineEdit(requested) as EditSpec };
  }
  if (requested && manifest.edits?.[requested]) {
    return { name: requested, spec: manifest.edits[requested] as EditSpec };
  }
  if (manifest.edit) return { name: requested ?? "default", spec: manifest.edit };
  const name = requested ?? manifest.defaultEdit ?? Object.keys(manifest.edits ?? {})[0];
  if (name && manifest.edits?.[name]) return { name, spec: manifest.edits[name] };
  throw new Error("fixture has no edit specification");
};

const boundedCaps = (caps: Partial<TraversalCaps> | undefined): TraversalCaps => {
  const merged = { ...DEFAULT_CAPS, ...(caps ?? {}) };
  for (const [key, value] of Object.entries(merged)) {
    if (!Number.isInteger(value) || Number(value) < 0) {
      throw new Error(`cap ${key} must be a non-negative integer`);
    }
  }
  return merged as TraversalCaps;
};

export const readFixture = (fixturePath: string, requestedEdit?: string, capOverrides?: Partial<TraversalCaps>): Fixture => {
  const root = resolve(fixturePath);
  const manifestPath = join(root, "fixture.json");
  if (!existsSync(manifestPath)) throw new Error(`missing fixture.json in ${root}`);
  const manifest = readJson(manifestPath);
  const workspaceRoot = resolve(root, manifest.workspace ?? "workspace");
  if (!statSync(workspaceRoot).isDirectory()) throw new Error(`missing fixture workspace ${workspaceRoot}`);
  const paths = filesUnder(workspaceRoot);
  const selected = selectedSpec(manifest, requestedEdit);
  const path = selected.spec.path;
  const afterPath = join(workspaceRoot, path);
  const beforeRoot = resolve(root, manifest.before ?? "before");
  const beforePath = join(beforeRoot, path);
  const afterText = readFileSync(afterPath, "utf8");
  const beforeText = existsSync(beforePath) ? readFileSync(beforePath, "utf8") : afterText;
  const changed = changedByteRange(beforeText, afterText);
  const beforeBytes = selected.spec.beforeRange
    ? {
        start: byteOffsetForRange(beforeText, selected.spec.beforeRange).start,
        end: byteOffsetForRange(beforeText, selected.spec.beforeRange).end,
      }
    : selected.spec.range
      ? byteOffsetForRange(beforeText, selected.spec.range)
      : changed.before;
  const afterBytes = selected.spec.afterRange
    ? byteOffsetForRange(afterText, selected.spec.afterRange)
    : selected.spec.range
      ? byteOffsetForRange(afterText, selected.spec.range)
      : changed.after;
  const beforeRange = selected.spec.beforeRange ?? selected.spec.range ?? rangeForBytes(beforeText, beforeBytes);
  const afterRange = selected.spec.afterRange ?? selected.spec.range ?? rangeForBytes(afterText, afterBytes);
  const markerPath = manifest.evaluationMarker
    ? resolve(workspaceRoot, manifest.evaluationMarker)
    : undefined;
  return {
    root,
    workspaceRoot,
    manifest,
    paths,
    edit: {
      name: selected.name,
      path,
      beforeText,
      afterText,
      beforeRange,
      afterRange,
      beforeBytes,
      afterBytes,
      diff: diff(path, beforeText, afterText),
    },
    caps: boundedCaps({ ...boundedCaps(manifest.caps), ...(capOverrides ?? {}) }),
    markerPath,
  };
};

const byteOffsetForRange = (source: string, range: LspRange): ByteRange => ({
  start: byteOffset(source, range.start.line, range.start.character),
  end: byteOffset(source, range.end.line, range.end.character),
});

const byteOffset = (source: string, line: number, character: number) => {
  const lines = source.split("\n");
  const safeLine = Math.max(0, Math.min(line, lines.length - 1));
  const lineStart = lines
    .slice(0, safeLine)
    .reduce((sum, value) => sum + Buffer.byteLength(value, "utf8") + 1, 0);
  return lineStart + Buffer.byteLength((lines[safeLine] ?? "").slice(0, character), "utf8");
};

export const parseCapOverrides = (args: string[]) => {
  const result: Partial<TraversalCaps> = {};
  const names: Array<[keyof TraversalCaps, string]> = [
    ["declarations", "declarations"],
    ["depth", "depth"],
    ["sourceCharacters", "source-characters"],
    ["files", "files"],
    ["externalPackages", "external-packages"],
    ["elapsedMs", "elapsed-ms"],
  ];
  for (const [name, cliName] of names) {
    const index = args.indexOf(`--max-${cliName}`);
    if (index >= 0) {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 0) throw new Error(`invalid --max-${cliName}`);
      result[name] = value;
    }
  }
  const capsIndex = args.indexOf("--caps");
  if (capsIndex >= 0) Object.assign(result, JSON.parse(args[capsIndex + 1] ?? "{}"));
  return result;
};
