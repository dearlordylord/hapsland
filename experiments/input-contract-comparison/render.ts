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
  diff: "textual-diff-v1:before-after-lines-with-byte-range",
  "whole-file": "whole-post-edit-file-v1:exact-after-buffer",
  "declaration-only": "edited-declaration-v1:root-artifact-source",
  "declaration-context": "edited-declaration-bounded-context-v1:bfs-references-with-omissions",
} as const;

const contractFor = (mode: InputMode) => INPUT_CONTRACTS[mode];
const rendererDigestFor = (mode: InputMode) => sha256(rendererSource[mode]);
export const RULE_DEFINITION_DIGEST = sha256(readFileSync(new URL("../../src/questions.ts", import.meta.url), "utf8"));

const changedByteRange = (before: string, after: string) => {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > prefix && afterEnd > prefix && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return { before: before.slice(prefix, beforeEnd), after: after.slice(prefix, afterEnd) };
};

export const renderDiff = (path: string, before: string, after: string) => {
  const changed = changedByteRange(before, after);
  return [
    `--- before/${path}`,
    `+++ after/${path}`,
    ...before.split(/(?<=\n)/).map((line) => `-${line.replace(/\n$/, "")}`),
    ...after.split(/(?<=\n)/).map((line) => `+${line.replace(/\n$/, "")}`),
    `@@ changed ${Buffer.byteLength(changed.before, "utf8")} -> ${Buffer.byteLength(changed.after, "utf8")} bytes @@`,
  ].join("\n");
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
