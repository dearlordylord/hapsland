import {
  artifactsFor,
  parseSource,
  schemaCandidatesFor,
  type DeclarationArtifact,
} from "../declaration-extraction/source.ts";
import {
  INPUT_CONTRACTS,
  sha256,
  stableJson,
  type CompletenessEvidence,
  type Fixture,
  type InputMode,
  type Omission,
  type RenderedInput,
} from "./protocol.ts";
import { readFileSync } from "node:fs";

export type ExtractionCaps = {
  readonly maxDeclarations: number;
  readonly maxDepth: number;
  readonly maxSourceCharacters: number;
};

export const DEFAULT_EXTRACTION_CAPS: ExtractionCaps = {
  maxDeclarations: 32,
  maxDepth: 3,
  maxSourceCharacters: 20_000,
};

const rendererSource = {
  diff: "textual-diff-v2:focused-unified-hunk-with-context-lines",
  "whole-file": "whole-post-edit-file-v1:exact-after-buffer",
  "declaration-only": "edited-declaration-v1:root-artifact-source",
  "declaration-context": "edited-declaration-bounded-context-v1:bfs-references-with-omissions",
} as const;

const contractFor = (mode: InputMode) => INPUT_CONTRACTS[mode];
const rendererDigestFor = (mode: InputMode) => sha256(rendererSource[mode]);
export const RULE_DEFINITION_DIGEST = sha256(readFileSync(new URL("../../src/questions.ts", import.meta.url), "utf8"));

export const renderDiff = (path: string, before: string, after: string) => {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  if (beforeLines.at(-1) === "") beforeLines.pop();
  if (afterLines.at(-1) === "") afterLines.pop();
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1;
  let beforeSuffix = beforeLines.length;
  let afterSuffix = afterLines.length;
  while (beforeSuffix > prefix && afterSuffix > prefix && beforeLines[beforeSuffix - 1] === afterLines[afterSuffix - 1]) {
    beforeSuffix -= 1;
    afterSuffix -= 1;
  }
  const context = 2;
  const declarationHeader = (lines: readonly string[], end: number) => {
    for (let index = end - 1; index >= 0; index -= 1) {
      if (/^\s*(?:export\s+)?(?:interface\b|type\s+\w+\s*=|(?:const|let|var)\s+\w+\s*=)/.test(lines[index] ?? "")) return index;
    }
    return undefined;
  };
  const header = declarationHeader(beforeLines, prefix) ?? declarationHeader(afterLines, prefix);
  const beforeStart = Math.max(0, header === undefined ? prefix - context : Math.min(prefix - context, header));
  const afterStart = Math.max(0, header === undefined ? prefix - context : Math.min(prefix - context, header));
  const beforeEnd = Math.min(beforeLines.length, beforeSuffix + context);
  const afterEnd = Math.min(afterLines.length, afterSuffix + context);
  const lines = [
    `--- before/${path}`,
    `+++ after/${path}`,
    `@@ -${beforeStart + 1},${beforeEnd - beforeStart} +${afterStart + 1},${afterEnd - afterStart} @@`,
  ];
  for (let index = beforeStart; index < prefix; index += 1) lines.push(` ${beforeLines[index]}`);
  for (let index = prefix; index < beforeSuffix; index += 1) lines.push(`-${beforeLines[index]}`);
  for (let index = prefix; index < afterSuffix; index += 1) lines.push(`+${afterLines[index]}`);
  for (let index = beforeSuffix; index < beforeEnd; index += 1) lines.push(` ${beforeLines[index]}`);
  return lines.join("\n");
};

const parseArtifacts = (fixture: Fixture) => {
  const sourceFile = parseSource(fixture.path, fixture.path, fixture.after, `fixture://${fixture.path}`);
  const declarations = artifactsFor(sourceFile, fixture.path);
  const schemas = schemaCandidatesFor(sourceFile, fixture.path);
  return { sourceFile, artifacts: [...declarations, ...schemas] };
};

const findRoot = (fixture: Fixture, artifacts: readonly DeclarationArtifact[]) => {
  const matches = artifacts.filter((artifact) => artifact.name === fixture.rootName && artifact.kind === fixture.rootKind);
  const root = matches[0];
  if (!root) throw new Error(`fixture ${fixture.id} root ${fixture.rootName} was not extracted`);
  return root;
};

const completeness = (
  fixture: Fixture,
  included: readonly string[],
  omissions: readonly Omission[],
): CompletenessEvidence => {
  const required = [...fixture.evidence.requiredReferences];
  const missingRequired = omissions.some((omission) => omission.required);
  const hasOmissions = omissions.length > 0;
  return {
    status: missingRequired ? "incomplete-required" : hasOmissions ? "incomplete-irrelevant" : "complete",
    required,
    included,
    omissions,
  };
};

const contextFor = (fixture: Fixture, root: DeclarationArtifact, artifacts: readonly DeclarationArtifact[], caps: ExtractionCaps) => {
  const byName = new Map<string, DeclarationArtifact>();
  for (const artifact of artifacts) if (artifact.name !== root.name && !byName.has(artifact.name)) byName.set(artifact.name, artifact);
  const required = new Set(fixture.evidence.requiredReferences);
  const optional = new Set(fixture.evidence.optionalReferences ?? []);
  const included: DeclarationArtifact[] = [];
  const omissions: Omission[] = [];
  const seen = new Set<string>([root.name]);
  const queue = root.references.map((reference) => ({ name: reference.name, depth: 1 }));
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || seen.has(next.name)) continue;
    seen.add(next.name);
    const isRequired = required.has(next.name);
    const artifact = byName.get(next.name);
    if (!artifact) {
      if (isRequired || optional.has(next.name)) omissions.push({ name: next.name, reason: "not-found", required: isRequired });
      continue;
    }
    if (next.depth > caps.maxDepth) {
      omissions.push({ name: next.name, reason: "depth", required: isRequired });
      continue;
    }
    if (included.length >= caps.maxDeclarations) {
      omissions.push({ name: next.name, reason: "declarations", required: isRequired });
      continue;
    }
    const projected = included.reduce((sum, item) => sum + item.source.length, 0) + artifact.source.length;
    if (projected > caps.maxSourceCharacters) {
      omissions.push({ name: next.name, reason: "source-characters", required: isRequired });
      continue;
    }
    included.push(artifact);
    for (const reference of artifact.references) queue.push({ name: reference.name, depth: next.depth + 1 });
  }
  for (const name of required) {
    if (!included.some((artifact) => artifact.name === name) && !omissions.some((omission) => omission.name === name)) {
      omissions.push({ name, reason: "not-found", required: true });
    }
  }
  for (const name of optional) {
    if (!included.some((artifact) => artifact.name === name) && !omissions.some((omission) => omission.name === name)) {
      omissions.push({ name, reason: "not-found", required: false });
    }
  }
  return { included, omissions, evidence: completeness(fixture, included.map((item) => item.name), omissions) };
};

export const renderInput = (
  fixture: Fixture,
  mode: InputMode,
  caps: ExtractionCaps = DEFAULT_EXTRACTION_CAPS,
): RenderedInput => {
  const fixtureDigest = fixture.fixtureDigest;
  const contentHash = fixture.contentHash;
  const base = {
    mode,
    contract: contractFor(mode),
    rendererDigest: rendererDigestFor(mode),
    ruleDefinitionDigest: RULE_DEFINITION_DIGEST,
    extractionProfile: caps,
    fixtureId: fixture.id,
    fixtureDigest,
    contentHash,
    path: fixture.path,
    domain: fixture.domain,
    contextNames: [] as readonly string[],
    completeness: {
      status: "complete" as const,
      required: [...fixture.evidence.requiredReferences],
      included: [],
      omissions: [],
    },
  };
  let source: string;
  let before: string | undefined;
  let after: string | undefined;
  let declarationName: string | undefined;
  let contextNames: readonly string[] = [];
  let evidence: CompletenessEvidence = base.completeness;
  let extractionMs = 0;
  if (mode === "diff") {
    before = fixture.before;
    after = fixture.after;
    source = renderDiff(fixture.path, fixture.before, fixture.after);
  } else if (mode === "whole-file") {
    source = fixture.after;
  } else {
    const extractionStarted = performance.now();
    const { artifacts } = parseArtifacts(fixture);
    const root = findRoot(fixture, artifacts);
    extractionMs = Math.max(0, performance.now() - extractionStarted);
    declarationName = root.name;
    if (mode === "declaration-only") {
      source = root.source;
      if (fixture.evidence.requiredReferences.length > 0) {
        evidence = completeness(
          fixture,
          [],
          fixture.evidence.requiredReferences.map((name) => ({ name, reason: "unsupported" as const, required: true })),
        );
      }
    } else {
      const context = contextFor(fixture, root, artifacts, caps);
      contextNames = context.included.map((item) => item.name);
      evidence = context.evidence;
      source = [root.source, ...context.included.map((item) => `/* referenced context: ${item.name} */\n${item.source}`), `/* completeness: ${stableJson(evidence)} */`].join("\n\n");
    }
  }
  const renderingStarted = performance.now();
  const sourceCharacters = source.length;
  const requestBytes = Buffer.byteLength(stableJson({
    artifact: { domain: base.domain, path: base.path, source },
    inputContract: base.contract,
    rendererDigest: base.rendererDigest,
    ruleDefinitionDigest: base.ruleDefinitionDigest,
    extractionProfile: base.extractionProfile,
    completeness: evidence,
  }), "utf8");
  return {
    ...base,
    source,
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
    ...(declarationName === undefined ? {} : { declarationName }),
    contextNames,
    completeness: evidence,
    extractionMs,
    renderingMs: Math.max(0, performance.now() - renderingStarted),
    sourceCharacters,
    requestBytes,
  };
};

export const modes: readonly InputMode[] = ["diff", "whole-file", "declaration-only", "declaration-context"];
