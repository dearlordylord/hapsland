// Source-free observation of event-named type files beside the production hook.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve, isAbsolute, sep } from "node:path";
import * as Effect from "effect/Effect";
import { nativeDirectCandidates } from "../../../src/direct-event/adapter.ts";
import { analyzeTypeFile } from "../../../src/direct-event/analyzer.ts";
import { eligibleNamedPath } from "../../../src/direct-event/selection.ts";

const maxCaptureBytes = 32 * 1024;

export async function inspectEdit(event) {
  if (event?.tool_name !== "apply_patch") return { kind: "no-patch", authority: "observational-only", candidates: [] };
  const command = event.tool_input?.command;
  const candidates = typeof command === "string" ? nativeDirectCandidates(command) : undefined;
  if (!candidates) return { kind: "unparsed-patch", authority: "observational-only", candidates: [] };
  const root = event.cwd;
  if (typeof root !== "string") return { kind: "missing-root", authority: "observational-only", candidates: [] };
  const observations = [];
  for (const candidate of candidates) {
    const path = candidate.path;
    const absolute = resolve(root, path);
    const within = relative(root, absolute);
    if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
      observations.push({ operation: candidate.operation, status: "outside-root" });
      continue;
    }
    if (candidate.operation !== "add" && candidate.operation !== "update") {
      observations.push({ path: within, operation: candidate.operation, status: "unsupported-operation" });
      continue;
    }
    const eligible = await Effect.runPromise(eligibleNamedPath(root, path)).catch(() => undefined);
    if (!eligible) {
      observations.push({ path: within, operation: candidate.operation, status: "selection-excluded" });
      continue;
    }
    let bytes;
    try { bytes = await readFile(eligible.absolutePath); }
    catch {
      observations.push({ path: eligible.relativePath, operation: candidate.operation, status: "unreadable" });
      continue;
    }
    if (bytes.byteLength > maxCaptureBytes) {
      observations.push({ path: eligible.relativePath, operation: candidate.operation, status: "capture-oversize", bytes: bytes.byteLength });
      continue;
    }
    let source;
    try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch {
      observations.push({ path: eligible.relativePath, operation: candidate.operation, status: "capture-invalid-utf8", bytes: bytes.byteLength });
      continue;
    }
    if (source.includes("\0")) {
      observations.push({ path: eligible.relativePath, operation: candidate.operation, status: "capture-nul", bytes: bytes.byteLength });
      continue;
    }
    const analysis = analyzeTypeFile(eligible.relativePath, source);
    observations.push({
      path: eligible.relativePath,
      operation: candidate.operation,
      status: analysis.status,
      reason: analysis.status === "unsupported" ? analysis.reason : undefined,
      bytes: bytes.byteLength,
      sourceHash: createHash("sha256").update(bytes).digest("hex"),
      units: analysis.status === "analyzed" ? analysis.units.map((unit) => ({
        name: unit.status === "ready" ? unit.unit.root.artifact.name : unit.root.name,
        status: unit.status,
        ...(unit.status === "unsupported" ? { reason: unit.reason } : {}),
      })) : [],
    });
  }
  return { kind: "parsed-patch", authority: "observational-only", candidates: observations };
}

export function summarizeAdvice(context) {
  if (typeof context !== "string" || !context.startsWith("Advisory direct-event review")) {
    return [];
  }
  return context.split("\n").slice(1).flatMap((line) => {
    const match = /^(.*?) :: (.*?) \[([a-z0-9_/-]+), p=/.exec(line);
    return match ? [{ path: match[1], declaration: match[2], ruleId: match[3] }] : [];
  });
}
