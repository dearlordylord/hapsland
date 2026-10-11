import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import { parse } from "smol-toml";
import { inspectRust, inspectRustModules } from "../../../packages/source-analysis/dist/direct-event/languages/rust.js";
import { eligibleNamedPath, contextDirectFilePolicy, DEFAULT_DIRECT_FILE_POLICY } from "../../../packages/native-observation/dist/direct-event/selection.js";
import { GRAPH_LIMIT_CEILINGS } from "../../../packages/canonical-policy/dist/canonical/graph-limits.js";
import { languageForPath } from "../../../packages/source-analysis/dist/direct-event/languages/registry.js";
import { createGraphFixtures } from "./fixtures.mjs";
import { sourceFacts, artifact, tomlValue } from "../../../packages/source-analysis/src/direct-event/graph-resolution/frontend-codec.mjs";
import { createServiceSession, list, unlist, fromProductValue, binary64 } from "../../../packages/source-analysis/src/direct-event/graph-resolution/service-session.mjs";

// Full post-root expansion interpreter, using actual filesystem/access/parser
// services. Preparation and the universal whole-observer relation remain gates.
const folder = import.meta.dirname,
  root = path.resolve(folder, "../../..");
mkdirSync(path.join(root, "node_modules/.cache"), {
  recursive: true
});
const temporary = mkdtempSync(path.join(root, "node_modules/.cache/entry-specification-"));
const wrapperPath = path.join(folder, ".entry-specification-" + path.basename(temporary) + ".bend");
const tag = (name, fields = {}) => ({
    $: name,
    ...fields
  }),
  label = v => v.$.split(".").at(-1);
const t = (name, fields = {}) => tag("Types." + name, fields),
  _d = (name, fields = {}) => tag("ExpansionDriverSpecification." + name, fields);
const g = (name, fields = {}) => tag("../../../../agent-flow-bend/ImportGraph." + name, fields);
const _maybe = v => v === undefined ? tag("None") : tag("Some", {
  value: v
});
const canonical = v => typeof v === "bigint" ? Number(v) : Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "$" ? label(v) : canonical(x)])) : v;
const qualify = (v, prefix, names) => v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "$" && names.has(x) ? prefix + "." + x : qualify(x, prefix, names)])) : v;
const forestNames = new Set(["Forest", "Node", "Pending", "ReferenceSymbol", "ArtifactIdentity", "Included", "Expanded", "Omitted"]);
const _fq = v => qualify(v, "ForestSpecification", forestNames);
function observationValue(value) {
  const own = (name, fields = {}) => ({
    $: "WholeObservation." + name,
    ...fields
  });
  const text = value => own("Text", {
    units: list(Array.from({
      length: value.length
    }, (_, i) => value.charCodeAt(i)))
  });
  if (value === null) return own("Null");
  if (typeof value === "boolean") return own("Boolean", {
    value
  });
  if (typeof value === "number") return own("Number", {
    bits: binary64(value)
  });
  if (typeof value === "string") return own("StringValue", {
    text: text(value)
  });
  if (Array.isArray(value)) return own("ArrayValue", {
    items: list(value.map(observationValue))
  });
  assert.ok(value && typeof value === "object");
  return own("ObjectValue", {
    fields: list(Object.entries(value).filter(([, value]) => value !== undefined).map(([key, value]) => own("Field", {
      key: text(key),
      value: observationValue(value)
    })))
  });
}
const fields = value => unlist(value).map(item => [item.key, item.value]);
const rustRoute = value => label(value) === "None" ? undefined : {
  path: value.value.path,
  cratePath: value.value.crate_path,
  ...(label(value.value.modules) === "None" ? {} : {
    crateModules: new Map(fields(value.value.modules.value))
  }),
  depth: Number(value.value.depth)
};
const rustTask = value => ({
  path: value.path,
  ...(label(value.route) === "None" ? {} : {
    route: rustRoute(value.route)
  })
});
const rustRole = value => ({
  ...(label(value.crate_root) === "None" ? {} : {
    rustCrateRoot: value.crate_root.value
  }),
  ...(label(value.external_module) === "None" ? {} : {
    rustExternalModule: value.external_module.value
  }),
  ...(label(value.modules) === "None" ? {} : {
    rustCrateModules: new Map(fields(value.modules.value))
  })
});
const rawFixtures = createGraphFixtures();
const fixtures = rawFixtures.slice();
fixtures.push({
  name: "rust-malformed-cargo-port",
  path: "src/lib.rs",
  source: "mod a; pub struct Root {}",
  files: {
    "Cargo.toml": "[package\nname=bad",
    "src/a.rs": "pub struct A {}"
  },
  cache: new Map()
});
const privateCacheFixture = rawFixtures.find(f => f.name === "rust-context-read-policy");
assert.ok(privateCacheFixture);
fixtures.push({
  ...privateCacheFixture,
  name: "rust-private-preparation-cache",
  cache: undefined
});
fixtures.push({
  name: "rust-function-binding-unsupported",
  path: "src/lib.rs",
  branch: "function",
  source: "mod a; pub fn Root() {}",
  files: {
    "Cargo.toml": '[package]\nname="fixture"\nedition="2024"',
    "src/a.rs": "pub struct A {}"
  },
  cache: new Map()
});
fixtures.push({
  name: "rollback-pending-owner",
  source: "import type { A } from './a'; export interface Root { a: A }",
  files: {
    "a.ts": "import type { B } from './b'; export interface A { b: B; payload: '" + "x".repeat(2000) + "' }",
    "b.ts": "export interface B {}"
  },
  limits: {
    treeBytes: 900
  }
});
fixtures.push({
  name: "deadline-before-complete",
  source: "export interface Root {}",
  files: {},
  expireAt: 2
});
fixtures.push({
  name: "mixed-file-bundle",
  path: "root.bend",
  source: "import Base\nimport ./a.bend as A\ntype Root is Data:\n  Root{flags: List<&2,U32>, a: A.A}",
  files: {
    "a.bend": "type A is Data:\n  A{}"
  }
});
fixtures.push({
  ...rawFixtures.find(f => f.name === "large-import-diamond-cycle"),
  name: "expansion-capture-provider-error",
  throwCaptureAfter: 1
});
fixtures.push({
  ...rawFixtures.find(f => f.name === "rust-context-read-policy"),
  name: "preparation-capture-provider-error",
  throwCaptureAfter: 0
});
fixtures.push({
  ...rawFixtures.find(f => f.name === "rust-context-read-policy"),
  name: "private-preparation-capture-provider-error",
  cache: undefined,
  throwCaptureAfter: 1
});
fixtures.push({
  name: "first-clock-provider-error",
  source: "export interface Root {}",
  files: {},
  throwClock: true
});
for (const [name, throwClockAt] of [["python-preparation-clock-provider-error", 1], ["python-root-clock-provider-error", 2]]) fixtures.push({
  name,
  path: "root.py",
  source: "class Root:\n    value: str",
  files: {},
  throwClockAt
});
fixtures.push({
  name: "root-local-work-refused",
  source: "import type { Imported } from './a'; interface A {} interface B {} export interface Root { imported: Imported; a: A; b: B }",
  files: {
    "a.ts": "export interface Imported {}"
  },
  limits: {
    work: 1
  }
});
fixtures.push({
  name: "root-declaration-missing",
  source: "export interface Other {}",
  files: {}
});
fixtures.push({
  name: "root-bundled-work-refused",
  path: "root.bend",
  source: "import Base\ntype A is Data:\n  A{}\ntype B is Data:\n  B{}\ntype Root is Data:\n  Root{values: List<&2,U32>, a: A, b: B}",
  files: {},
  limits: {
    work: 1
  }
});
for (const [name, limits] of [["root-files-refused", {
  files: 0
}], ["root-work-refused", {
  work: 0
}], ["root-read-refused", {
  readBytes: 0
}]]) fixtures.push({
  name,
  source: "export interface Root {}",
  files: {},
  limits,
  expectedReason: "root-admission",
  expectedStage: "RootAdmission"
});
fixtures.push({
  name: "root-deadline-refused",
  source: "export interface Root {}",
  files: {},
  expireAt: 1,
  expectedReason: "root-admission",
  expectedStage: "AwaitRootDeadline"
});
fixtures.push({
  name: "unregistered-language-refused",
  path: "root.unknown",
  source: "",
  files: {},
  expectedReason: "language",
  expectedStage: "LanguageAdmission"
});
const expectedReturns = {
  "absolute-import-spelling": ["frontend", "AwaitRootFacts"],
  "rust-preparation-work-refusal": ["binding", "RustAdmission"],
  "rust-deadline-before-complete": ["binding", "AwaitRustDeadline"],
  "rust-function-binding-unsupported": ["frontend", "AwaitRootFacts"],
  "root-local-work-refused": ["local-admission", "AwaitRootFacts"],
  "root-bundled-work-refused": ["local-admission", "AwaitRootFacts"],
  "root-declaration-missing": ["declaration", "AwaitRootFacts"]
};
for (const fixture of fixtures) if (expectedReturns[fixture.name]) {
  ;
  [fixture.expectedReason, fixture.expectedStage] = expectedReturns[fixture.name];
}
const source = f => f.source ?? `import type { A } from '${f.importPath ?? "./a"}'; export interface Root { a: A }`;
function wrapper() {
  let text = "import Base\nimport ./EntrySpecification.bend as I\nimport ./PreparationSpecification.bend as P\nimport ./ExpansionDriverSpecification.bend as D\nimport ./ExpansionSpecification.bend as X\nimport ./Types.bend as T\nimport ./Environment.bend as E\nimport ./WholeObservation.bend as O\nimport ./DeadlineSpecification.bend as Deadline\n";
  for (const kind of ["basename", "join", "dirname", "extension", "normalize", "relative"]) {
    const signature = kind === "join" ? "parts: List<&2, String>" : kind === "relative" ? "from: String, to: String" : "value: String";
    text += `def ${kind}(${signature}) -> String:\n  ""\n`;
  }
  return text + `def absolute(value: String) -> Bool:\n  String.starts_with(value, "/")\ndef expired(bits: T.Binary64) -> Bool:\n  Deadline.expired(bits)\ndef selection(state: D.State) -> D.Selection:\n  D.choose(~absolute, ~dirname, ~join, ~normalize, ~extension, "/", 10000n, state)\ndef reply(state: D.State, outcome: T.ServiceOutcome) -> D.Selection:\n  D.consume(~dirname, ~join, ~relative, ~expired, state, outcome)\ndef suspend(operation: T.Operation, world: Nat) -> E.Response<Nat>:\n  match world:\n    case +sequence: E.Suspended{(sequence + 1n : Nat), O.ProviderLease{1n, sequence}, []}\ndef suffix_result(+name: String, suffix: Maybe<&2, String>) -> String:
  match suffix:
    case None{}: name
    case Some{+suffix}: Bool.pick(String, String.ends_with(name, suffix), String.take(name, (String.length(name) - String.length(suffix) : Nat)), name)
def suffix_base(value: String, suffix: Maybe<&2, String>) -> String:
  suffix_result(basename(value), suffix)
def entry_selection(state: I.State) -> I.Selection:
  I.choose(~extension, state)
def entry_reply(state: I.State, outcome: T.ServiceOutcome) -> I.Selection:
  I.consume(~expired, state, outcome)
def preparation_selection(state: P.State) -> P.Selection:
  P.choose(~absolute, ~dirname, ~relative, "/", state)
def preparation_reply(state: P.State, outcome: T.ServiceOutcome) -> P.Selection:
  P.consume(~absolute, ~dirname, ~suffix_base, ~join, ~relative, ~extension, ~normalize, ~expired, "/", state, outcome)
def initial(input: T.ResolverInput) -> I.Progress<Nat>:
  I.begin(Nat, input, 1n, E.WorldState{0n, []})
def advance(progress: I.Progress<Nat>) -> I.Progress<Nat>:
  I.advance(~entry_selection, ~entry_reply, ~preparation_selection, ~preparation_reply, ~selection, ~reply, Nat, suspend, progress)
def complete(progress: I.Progress<Nat>, completion: E.Completion<Nat>) -> I.Progress<Nat>:
  I.complete(~entry_reply, ~preparation_reply, ~reply, Nat, progress, completion)
def cancel(progress: I.Progress<Nat>) -> I.Progress<Nat>:
  I.cancel(Nat, progress)
def main() -> Unit:\n  Unit{}\n`;
}
function event(e) {
  switch (e.kind) {
    case "root":
      return g("Root", {
        target: BigInt(e.target),
        source_bytes: BigInt(e.sourceBytes),
        tree_bytes: BigInt(e.treeBytes),
        local_work: BigInt(e.localWork ?? 0),
        edges: list(e.edges.map(BigInt))
      });
    case "next":
      return g("Next");
    case "resolved":
      return g("Resolved", {
        target: BigInt(e.target),
        result: g({
          found: "Found",
          missing: "NotFound",
          ambiguous: "Many",
          unsupported: "Unhandled"
        }[e.result])
      });
    case "pathChecked":
      return g("PathChecked", {
        allowed: e.allowed
      });
    case "captureFailed":
      return g("CaptureFailed");
    case "deadlineReached":
      return g("DeadlineReached");
    case "captured":
      return g("Captured", {
        source_bytes: BigInt(e.sourceBytes),
        node_bytes: BigInt(e.treeBytes),
        local_work: BigInt(e.localWork ?? 0),
        edges: list(e.edges.map(BigInt))
      });
    default:
      throw Error("unobserved native event " + e.kind);
  }
}
function mapKeys(value) {
  switch (label(value)) {
    case "MTip":
      return [];
    case "MLeaf":
      return [value.key];
    case "MNode":
      return [...mapKeys(value.lo), ...mapKeys(value.hi)];
    default:
      throw Error("invalid map");
  }
}
try {
  const wrapperHashes = [],
    emissionHashes = [],
    compiledWrappers = new Map();
  const nativePath = path.join(root, "packages/source-analysis/dist/direct-event/graph-resolver.js");
  const dependencies = ["../../../packages/source-analysis/src/direct-event/graph-resolution/SourceValidationSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/DeadlineSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/BoundaryValidationSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/EntrySpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/PreparationSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/ExpansionDriverSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/ExpansionSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/ForestSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/ForestAllowance.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/SignedLocalSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/SPEC.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/GraphSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/RustSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/WholeObservation.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/Environment.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/Types.bend", "./entry-specification-check.mjs", "./fixtures.mjs", "../../../packages/source-analysis/src/direct-event/graph-resolution/frontend-codec.mjs", "../../../packages/source-analysis/src/direct-event/graph-resolution/service-session.mjs", "../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/SPEC.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/RELATION.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/BOUNDARY.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/core.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/Traversal.bend", "../../../bun.lock", "../../../packages/source-analysis/dist/direct-event/languages/rust.js", "../../../packages/source-analysis/dist/direct-event/languages/rust-module-context.js", "../../../packages/source-analysis/dist/direct-event/languages/rust-adapter.js", "../../../packages/source-analysis/dist/direct-event/languages/registry.js", "../../../packages/source-analysis/dist/direct-event/languages/python.js", nativePath];
  const hashes = () => Object.fromEntries(dependencies.map(n => [n, createHash("sha256").update(readFileSync(path.isAbsolute(n) ? n : path.join(folder, n))).digest("hex")]));
  const sources = hashes(),
    cases = [];
  async function compile(name, file = path.join(folder, name + ".bend")) {
    const output = path.join(temporary, name + ".mjs");
    execFileSync("bend", [file, "-o", output], {
      timeout: 5000,
      maxBuffer: 2 ** 20
    });
    if (name.startsWith("DriverCheck-")) {
      let js = readFileSync(output, "utf8");
      const originalHash = createHash("sha256").update(js).digest("hex");
      for (const kind of ["basename", "join", "dirname", "extension", "normalize", "relative"]) {
        const pattern = new RegExp("function \\$" + kind + "\\$\\(([^)]*)\\) \\{");
        assert.equal([...js.matchAll(new RegExp(pattern.source, "g"))].length, 1, kind + " unique emitted mechanical primitive");
        const args = js.match(pattern)[1].split(",").map(x => x.trim());
        assert.equal(args.length, kind === "relative" ? 2 : 1, kind + " emitted ABI arity");
        js = js.replace(pattern, (all, args) => all + `\n return globalThis.__hapslandEntryPath(${JSON.stringify(kind)},[${args}]);`);
      }
      emissionHashes.push({
        name,
        originalHash,
        patchedHash: createHash("sha256").update(js).digest("hex")
      });
      writeFileSync(output, js);
    }
    return (await import(pathToFileURL(output))).default;
  }
  const policy = await compile("GraphSpecification");
  const portCopy = path.join(temporary, "observed-ports.mjs");
  writeFileSync(portCopy, `import {sourceFacts} from '${pathToFileURL(path.join(folder, "../../../packages/source-analysis/src/direct-event/graph-resolution/frontend-codec.mjs"))}';import {lstat as realLstat} from 'node:fs/promises';import * as Effect from 'effect/Effect';import {eligibleNamedPath as realAccess} from '${pathToFileURL(path.join(root, "packages/native-observation/dist/direct-event/selection.js"))}';export const events=[];export function observedInspect(session,file,source,branch){const facts=session.inspect(file,source,branch);events.push({kind:'frontend',path:file,text:source,branch,facts:facts===undefined?undefined:JSON.parse(JSON.stringify(sourceFacts(facts),(_key,value)=>typeof value==='bigint'?Number(value):value))});return facts}export function reset(){events.length=0}export async function lstat(file){try{const value=await realLstat(file);events.push({kind:'status',path:file,status:value.isFile()?'ExistingFile':'ExistingOther'});return value}catch(error){events.push({kind:'status',path:file,status:'FileAbsent'});throw error}}export function eligibleNamedPath(...args){return Effect.map(realAccess(...args),value=>{events.push({kind:'access',path:args[1],allowed:value!==undefined,relativePath:value?.relativePath});return value})}`);
  const nativePorts = await import(pathToFileURL(portCopy));
  const nativeCopy = path.join(temporary, "native.mjs"),
    nativeSource = readFileSync(nativePath, "utf8").replaceAll(/from "(\.{1,2}\/[^"]+)"/g, (_all, n) => `from "${pathToFileURL(path.join(path.dirname(nativePath), n))}"`);
  const instrument = (text, needle, replacement) => {
    assert.equal(text.split(needle).length, 2, "unique native observer anchor " + needle);
    return text.replace(needle, replacement);
  };
  const rewrite = file => readFileSync(file, "utf8").replaceAll(/from "(\.{1,2}\/[^"]+)"/g, (_all, n) => `from "${pathToFileURL(path.join(path.dirname(file), n))}"`);
  const languageDirectory = path.join(path.dirname(nativePath), "languages"),
    moduleOwner = path.join(languageDirectory, "rust-module-context.js"),
    adapterOwner = path.join(languageDirectory, "rust-adapter.js"),
    registryOwner = path.join(languageDirectory, "registry.js");
  const moduleCopy = path.join(temporary, "rust-context.mjs"),
    adapterCopy = path.join(temporary, "rust-adapter.mjs"),
    registryCopy = path.join(temporary, "registry.mjs");
  const finalMarker = "return { options: uniqueModuleRole(invalid, command.kind, roles), dependencies: [...dependencies].sort(), remaining };";
  const observePorts = text => instrument(instrument(text, 'import { lstat } from "node:fs/promises";', `import {lstat} from "${pathToFileURL(portCopy)}";`), 'import { contextDirectFilePolicy, eligibleNamedPath } from "@hapsland/native-observation/direct-event/selection";', `import {contextDirectFilePolicy} from "@hapsland/native-observation/direct-event/selection";import {eligibleNamedPath} from "${pathToFileURL(portCopy)}";`);
  let moduleSource = instrument(observePorts(rewrite(moduleOwner)), finalMarker, "preparationObservation={state,command,tasks:[...tasks],targets:[...targets],nextEdge,nextTarget,active,invalid,accumulatedDependencies:[...dependencies],roles,captures:[...captures],options:uniqueModuleRole(invalid,command.kind,roles),dependencies:[...dependencies].sort(),remaining}; " + finalMarker);
  moduleSource = instrument(moduleSource, "captures.set(path, rootCapture);", 'captures.set(path, rootCapture);events.push({kind:"cacheStore",role:context.captureCache===undefined?"private":"caller",path,capture:rootCapture});');
  moduleSource = instrument(moduleSource, "captures.set(selected.relativePath, capture);", 'captures.set(selected.relativePath, capture);events.push({kind:"cacheStore",role:context.captureCache===undefined?"private":"caller",path:selected.relativePath,capture});');
  moduleSource = instrument(moduleSource, "return record(parse(source));", "return record(observedCargoParse(source));");
  moduleSource = instrument(moduleSource, "inspectRustModules(source));", "observedModules(source));");
  moduleSource += `\nimport {events} from '${pathToFileURL(portCopy)}';import {tomlValue} from '${pathToFileURL(path.join(folder, "../../../packages/source-analysis/src/direct-event/graph-resolution/frontend-codec.mjs"))}';const canonicalFacts=value=>JSON.parse(JSON.stringify(value,(_key,value)=>typeof value==='bigint'?Number(value):value));function observedCargoParse(source){try{const syntax=parse(source);events.push({kind:'cargo',text:source,syntax:canonicalFacts(tomlValue(syntax))});return syntax}catch(error){events.push({kind:'cargo',text:source,syntax:undefined});throw error}}function observedModules(source){const facts=inspectRustModules(source);events.push({kind:'modules',text:source,facts});return facts}\n`;
  moduleSource = instrument(moduleSource, "const captures = context.captureCache ?? new Map();", "const captures = context.captureCache ?? new Map();preparationCaptureCache=captures;");
  moduleSource += "\nexport let preparationObservation,preparationCaptureCache;export function resetPreparationObservation(){preparationObservation=undefined;preparationCaptureCache=undefined}\n";
  writeFileSync(moduleCopy, moduleSource);
  let adapterSource = instrument(rewrite(adapterOwner), pathToFileURL(moduleOwner).href, pathToFileURL(moduleCopy).href);
  adapterSource = instrument(adapterSource, "rust.inspectRust(file, source,", "observedRustInspect(file, source,");
  adapterSource += "\nexport let frontendCalls=[];export function resetFrontendCalls(){frontendCalls=[]}function observedRustInspect(file,source,options){frontendCalls.push({path:file,text:source,options:options??{}});return rust.inspectRust(file,source,options)}\n";
  writeFileSync(adapterCopy, adapterSource);
  writeFileSync(registryCopy, instrument(rewrite(registryOwner), pathToFileURL(adapterOwner).href, pathToFileURL(adapterCopy).href));
  const nativePreparation = await import(pathToFileURL(moduleCopy)),
    nativeRust = await import(pathToFileURL(adapterCopy));
  let observed = instrument(instrument(observePorts(nativeSource), pathToFileURL(registryOwner).href, pathToFileURL(registryCopy).href), "const transition = stepImportGraph(frame.state, event)", "nativeEvents.push(event); const transition = stepImportGraph(frame.state, event)");
  observed = instrument(observed, "binding.session.inspect(rootPath, rootCapture.text, binding.branch)", "observedInspect(binding.session,rootPath,rootCapture.text,binding.branch)");
  observed = instrument(observed, "frame.session.inspect(path, source.text, frame.branch)", "observedInspect(frame.session,path,source.text,frame.branch)");
  observed = instrument(observed, "frame.context.captureCache?.set(selected.relativePath, source);", 'frame.context.captureCache?.set(selected.relativePath, source);if(frame.context.captureCache!==undefined)events.push({kind:"cacheStore",role:"caller",path:selected.relativePath,capture:source});');
  observed += `\nimport {observedInspect,events} from '${pathToFileURL(portCopy)}';\n`;
  for (const [needle, replacement] of [["if (language === undefined)\n        return undefined;", 'if (language === undefined){preFrameReason={reason:"language"};return undefined;}'], ["const binding = yield* language.prepareGraph(rootPath, rootCapture, context, clock.limits, clock.expired);\n    if (binding === undefined)\n        return undefined;", 'const binding = yield* language.prepareGraph(rootPath, rootCapture, context, clock.limits, clock.expired);\n    if (binding === undefined){preFrameReason={reason:"binding"};return undefined;}'], ["if (!rootGraphBudgetAvailable(binding.limits, rootCapture, clock.expired))\n        return undefined;", 'if (!rootGraphBudgetAvailable(binding.limits, rootCapture, clock.expired)){preFrameReason={reason:"root-admission",binding};return undefined;}'], ["if (rootFile === undefined)\n        return undefined;", 'if (rootFile === undefined){preFrameReason={reason:"frontend",binding};return undefined;}'], ["if (rootDeclaration === undefined)\n        return undefined;", 'if (rootDeclaration === undefined){preFrameReason={reason:"declaration",binding,rootFile};return undefined;}']]) observed = instrument(observed, needle, replacement);
  observed = instrument(observed, "!permitLocalGraphFacts(binding.limits, budget.work, budget.maxDepth, budget.maxTargetsInFile, 0))\n        return undefined;", '!permitLocalGraphFacts(binding.limits, budget.work, budget.maxDepth, budget.maxTargetsInFile, 0)){preFrameReason={reason:"local-admission",binding};preFrameObservation={reason:"local-admission",binding,rootDeclaration,visited:[...visited],budget,built};return undefined;}');
  observed = instrument(observed, "const attachCapturedChild = (frame, targetId, target, path, source, file, declaration, child, localWorkBefore, visited) => {", "const attachCapturedChild = (frame, targetId, target, path, source, file, declaration, child, localWorkBefore, visited) => { registerBirth(child.node);");
  observed = instrument(observed, 'target.edge.owner.references[target.edge.index] = {\n        kind: "expanded",', 'registerBirth(child.node); target.edge.owner.references[target.edge.index] = {\n        kind: "expanded",');
  writeFileSync(nativeCopy, observed + `\nconst nativeEvents=[]; let preFrameObservation,preFrameReason;let birth=new WeakMap(),episode=0;
 function resetBirth(){preFrameObservation=undefined;preFrameReason=undefined;birth=new WeakMap();episode=0}
 function registerBirth(root){const current=++episode;function visit(node,route){if(birth.has(node))throw Error('node birth was renamed');birth.set(node,[current,route]);for(const [index,reference]of node.references.entries())if(reference.kind==='expanded')visit(reference.node,[...route,index])}visit(root,[])}
 function birthAddress(node){const value=birth.get(node);if(value===undefined)throw Error('unobserved node construction');return value}
 export {prepareGraphFrame,graphIteration,nativeEvents,resetBirth,registerBirth,birthAddress,preFrameObservation,preFrameReason};\n`);
  const nativeModule = await import(pathToFileURL(nativeCopy));
  const {
    prepareGraphFrame,
    graphIteration,
    nativeEvents,
    resetBirth,
    registerBirth,
    birthAddress
  } = nativeModule;
  for (const fixture of fixtures.filter(f => process.env.HAPSLAND_ENTRY_FIXTURE === undefined || f.name === process.env.HAPSLAND_ENTRY_FIXTURE)) {
    const wrapperText = wrapper(),
      wrapperHash = createHash("sha256").update(wrapperText).digest("hex");
    wrapperHashes.push({
      fixture: fixture.name,
      hash: wrapperHash
    });
    let bound = compiledWrappers.get(wrapperHash);
    if (bound === undefined) {
      writeFileSync(wrapperPath, wrapperText);
      bound = await compile("DriverCheck-" + wrapperHashes.length, wrapperPath);
      compiledWrappers.set(wrapperHash, bound);
    }
    globalThis.__hapslandExpansionPathQueries = [];
    globalThis.__hapslandEntryPath = (kind, args) => {
      const result = kind === "join" ? path.join(...unlist(args[0])) : path[kind === "extension" ? "extname" : kind](...args);
      globalThis.__hapslandExpansionPathQueries.push({
        kind,
        args,
        result
      });
      return result;
    };
    const directory = path.join(temporary, fixture.name);
    mkdirSync(directory);
    execFileSync("git", ["init", "-q", directory]);
    const selected = fixture.path ?? "root.ts",
      files = new Map([[selected, source(fixture)], ...Object.entries(fixture.files)]);
    for (const [n, text] of files) {
      mkdirSync(path.dirname(path.join(directory, n)), {
        recursive: true
      });
      writeFileSync(path.join(directory, n), text);
    }
    for (const n of fixture.directories ?? []) mkdirSync(path.join(directory, n), {
      recursive: true
    });
    const stable = n => ({
        text: files.get(n),
        byteLength: Buffer.byteLength(files.get(n))
      }),
      cache = fixture.cache === undefined ? undefined : new Map(fixture.cache),
      callerCache = fixture.cache === undefined ? undefined : new Map(fixture.cache);
    nativePorts.reset();
    const candidatePorts = [];
    const injectedError = new Error("fixture provider failure");
    let nativeCaptures = 0,
      candidateCaptures = 0;
    const captureResult = selection => fixture.unavailable ? {
      status: "unavailable",
      diagnostic: {
        stage: "capture",
        code: "fixture-unavailable",
        args: {}
      }
    } : {
      status: "captured",
      capture: stable(selection.relativePath)
    };
    let ticks = 0;
    const context = {
      root: directory,
      branch: fixture.branch ?? "type",
      policy: fixture.policy ?? DEFAULT_DIRECT_FILE_POLICY,
      limits: {
        ...GRAPH_LIMIT_CEILINGS,
        ...fixture.limits
      },
      captureCache: cache,
      observeCaptureDiagnostic: (path, diagnostic) => nativePorts.events.push({
        kind: "diagnostic",
        path,
        diagnostic
      }),
      now: () => {
        const tick = ticks++;
        if (fixture.throwClock || tick === fixture.throwClockAt) {
          nativePorts.events.push({
            kind: "clockFailure",
            message: injectedError.message
          });
          throw injectedError;
        }
        const value = tick >= (fixture.expireAt ?? Infinity) ? 5000 : 0;
        nativePorts.events.push({
          kind: "clock",
          value
        });
        return value;
      },
      captureSource: (_root, selection, _hooks, _identity, cap) => Effect.sync(() => {
        if (nativeCaptures++ === fixture.throwCaptureAfter) {
          nativePorts.events.push({
            kind: "captureFailure",
            path: selection.relativePath,
            cap,
            message: injectedError.message
          });
          throw injectedError;
        }
        const result = captureResult(selection);
        nativePorts.events.push({
          kind: "capture",
          path: selection.relativePath,
          cap,
          result
        });
        return result;
      })
    };
    nativeEvents.length = 0;
    resetBirth();
    nativePreparation.resetPreparationObservation();
    nativeRust.resetFrontendCalls();
    let native, expected, failed;
    try {
      native = await Effect.runPromise(prepareGraphFrame(selected, stable(selected), "Root", context));
      if (native) {
        registerBirth(native.unit.root);
        for (let i = 0; i < native.limits.work * 8 + 16; i++) {
          const result = await Effect.runPromise(graphIteration(native));
          if (result.done) {
            expected = result.unit;
            break;
          }
        }
      }
    } catch (error) {
      failed = error;
    }
    const nativeCallerCache = cache === undefined ? undefined : [...cache],
      nativePublishedPrefix = structuredClone(nativePorts.events),
      nativePreparationCache = nativePreparation.preparationCaptureCache === undefined ? undefined : [...nativePreparation.preparationCaptureCache];
    const language = languageForPath(selected);
    const rust = selected.endsWith(".rs"),
      parserBinding = rust || language === undefined ? undefined : await Effect.runPromise(language.prepareGraph(selected, stable(selected), {
        ...context,
        now: () => 0
      }, context.limits, () => false));
    assert.deepEqual(nativePorts.events, nativePublishedPrefix, fixture.name + " technical parser binding has no observed native effects");
    assert.deepEqual(cache === undefined ? undefined : [...cache], nativeCallerCache, fixture.name + " technical parser binding has no native cache changes");
    const limits = g("Limits", Object.fromEntries(Object.entries(context.limits).map(([k, v]) => [{
      sourceBytes: "source_bytes",
      treeBytes: "tree_bytes",
      readBytes: "read_bytes",
      outgoingEdges: "outgoing_edges"
    }[k] ?? k, BigInt(v)])));
    let driverTicks = 0;
    const actualRustCalls = [];
    const session = createServiceSession({
      invocation: 1,
      root: directory,
      callerCache,
      diagnostic: (path, diagnostic) => candidatePorts.push({
        kind: "diagnostic",
        path,
        diagnostic
      }),
      now: () => {
        const tick = driverTicks++;
        if (fixture.throwClock || tick === fixture.throwClockAt) {
          candidatePorts.push({
            kind: "clockFailure",
            message: injectedError.message
          });
          throw injectedError;
        }
        const value = tick >= (fixture.expireAt ?? Infinity) ? 5000 : 0;
        candidatePorts.push({
          kind: "clock",
          value
        });
        return value;
      },
      access: async n => {
        const value = await Effect.runPromise(eligibleNamedPath(directory, n, contextDirectFilePolicy(context.policy)));
        candidatePorts.push({
          kind: "access",
          path: n,
          allowed: value !== undefined,
          relativePath: value?.relativePath
        });
        return value;
      },
      capture: (selection, cap) => {
        if (candidateCaptures++ === fixture.throwCaptureAfter) {
          candidatePorts.push({
            kind: "captureFailure",
            path: selection.relativePath,
            cap,
            message: injectedError.message
          });
          throw injectedError;
        }
        const result = captureResult(selection);
        candidatePorts.push({
          kind: "capture",
          path: selection.relativePath,
          cap,
          result
        });
        return result;
      },
      parseCargo: text => {
        try {
          const syntax = tomlValue(parse(text));
          candidatePorts.push({
            kind: "cargo",
            text,
            syntax: JSON.parse(JSON.stringify(syntax, (_key, value) => typeof value === "bigint" ? Number(value) : value))
          });
          return syntax;
        } catch {
          candidatePorts.push({
            kind: "cargo",
            text,
            syntax: undefined
          });
          return undefined;
        }
      },
      inspectRustModules: text => {
        const facts = inspectRustModules(text);
        candidatePorts.push({
          kind: "modules",
          text,
          facts
        });
        return facts;
      },
      frontend: (n, text, frontend) => {
        assert.equal(label(frontend), rust ? "RustSourceContext" : selected.endsWith(".py") ? "PythonSourceContext" : selected.endsWith(".bend") ? "BendSourceContext" : "TypeScriptContext");
        assert.equal(label(frontend.branch), context.branch === "function" ? "FunctionBranch" : "TypeBranch", "exact frontend branch");
        const requestedBranch = label(frontend.branch) === "FunctionBranch" ? "function" : "type";
        if (rust && requestedBranch === "function") {
          candidatePorts.push({
            kind: "frontend",
            path: n,
            text,
            branch: requestedBranch,
            facts: undefined
          });
          return undefined;
        }
        const options = rust ? rustRole(frontend.context) : undefined;
        if (rust) actualRustCalls.push({
          path: n,
          text,
          options
        });
        const facts = rust ? inspectRust(n, text, options) : parserBinding.session.inspect(n, text, requestedBranch);
        const encoded = facts === undefined ? undefined : sourceFacts(facts);
        candidatePorts.push({
          kind: "frontend",
          path: n,
          text,
          branch: requestedBranch,
          facts: encoded === undefined ? undefined : JSON.parse(JSON.stringify(encoded, (_key, value) => typeof value === "bigint" ? Number(value) : value))
        });
        return encoded;
      }
    });
    const rootCapture = session.registerCapture(stable(selected));
    const input = t("ResolverInput", {
      invocation: 1n,
      root_path: selected,
      root_capture: rootCapture,
      root_bytes: BigInt(stable(selected).byteLength),
      root_name: "Root",
      root_source: source(fixture),
      branch: t(context.branch === "function" ? "FunctionBranch" : "TypeBranch"),
      caller_cache: session.callerCache,
      limits
    });
    let progress = bound.initial(input),
      requests = 0,
      steps = 0,
      trace = [],
      expectedEffects = [],
      preparationCacheSnapshot;
    const inner = x => label(x) === "EntryPreparing" || label(x) === "EntryExpanding" ? x.progress : x;
    const active = x => ["EntryReady", "EntrySelected", "EntryWaiting", "PreparationReady", "PreparationWaiting", "DriverReady", "DriverSelected", "DriverWaiting"].includes(label(inner(x)));
    while (active(progress)) {
      assert.ok(++steps < 20000, "mathematical evaluation bound is not normal completion");
      const current = inner(progress);
      if (preparationCacheSnapshot === undefined && label(progress) === "EntryReady" && label(progress.state.preparation) === "Some") preparationCacheSnapshot = session.cacheSnapshot(progress.state.preparation_cache.value);
      if (!["EntryWaiting", "PreparationWaiting", "DriverWaiting"].includes(label(current))) {
        progress = bound.advance(progress);
        continue;
      }
      const request = current.exchange.request;
      trace.push({
        request: label(request.operation)
      });
      assert.equal(Number(request.id), 1 + requests);
      expectedEffects.push(tag("WholeObservation.Invoked", {
        request
      }));
      const portOffset = candidatePorts.length;
      const response = await session.perform(request);
      if (label(request.operation) === "ReadFileStatus") candidatePorts.push({
        kind: "status",
        path: path.join(directory, request.operation.path),
        status: label(response.outcome.status)
      });
      if (["StoreCaptureCache", "InsertRootCaptureCache"].includes(label(request.operation))) {
        const op = request.operation,
          entries = session.cacheSnapshot(op.cache);
        candidatePorts.push({
          kind: "cacheStore",
          role: label(session.callerCache) === "Some" && Number(op.cache.id) === Number(session.callerCache.value.id) ? "caller" : "private",
          path: op.path,
          capture: entries.find(([key]) => key === op.path)[1]
        });
      }
      const completion = tag("Environment.Completion", {
        lease: current.exchange.lease,
        world: current.exchange.state.world,
        outcome: response.outcome,
        effects: list(candidatePorts.slice(portOffset).map(value => tag("WholeObservation.ProviderEffect", {
          value: observationValue(value)
        })))
      });
      expectedEffects.push(...unlist(completion.effects), tag("WholeObservation.Responded", {
        reply: t("Reply", {
          invocation: request.invocation,
          id: request.id,
          outcome: response.outcome
        })
      }));
      progress = bound.complete(progress, completion);
      requests++;
    }
    const entry = progress;
    progress = inner(progress);
    for (const query of globalThis.__hapslandExpansionPathQueries) {
      const host = query.kind === "join" ? path.join(...unlist(query.args[0])) : path[query.kind === "extension" ? "extname" : query.kind](...query.args);
      assert.equal(query.result, host, fixture.name + " exact mechanical primitive " + query.kind);
    }
    const publishedEffects = unlist(progress.world.effects);
    assert.deepEqual(canonical(publishedEffects), canonical(expectedEffects), fixture.name + " complete request/provider-delta/reply effect sequence");
    assert.deepEqual(publishedEffects.filter(effect => label(effect) === "ProviderEffect").map(effect => effect.value), candidatePorts.map(observationValue), fixture.name + " actual provider effects published in Environment");
    const headers = publishedEffects.filter(effect => label(effect) !== "ProviderEffect");
    assert.equal(headers.length, requests * 2);
    for (let i = 0; i < headers.length; i += 2) {
      assert.equal(label(headers[i]), "Invoked");
      assert.equal(label(headers[i + 1]), "Responded");
      assert.equal(headers[i].request.id, headers[i + 1].reply.id);
      assert.equal(Number(headers[i].request.id), i / 2 + 1);
    }
    assert.deepEqual(candidatePorts, nativePublishedPrefix, fixture.name + " same-invocation ordered clock/access/capture/status effects");
    if (fixture.throwClock || fixture.throwClockAt !== undefined || fixture.throwCaptureAfter !== undefined) {
      assert.equal(failed, injectedError, fixture.name + " native original error identity");
      assert.ok(["EntryFailed", "DriverFailed"].includes(label(progress)), fixture.name + " failure terminal");
      assert.equal(label(progress.failure), "ForeignProviderFailure");
      assert.equal(session.exception(progress.failure.exception), injectedError, fixture.name + " candidate original error identity before cleanup");
      if (rust) {
        assert.equal(label(entry.state.preparation_cache), nativePreparationCache === undefined ? "None" : "Some", fixture.name + " actual preparation cache presence on failure");
        if (nativePreparationCache !== undefined) assert.deepEqual(session.cacheSnapshot(entry.state.preparation_cache.value), nativePreparationCache, fixture.name + " internal effective preparation cache snapshot on failure");
      }
      assert.deepEqual(nativeCallerCache, callerCache === undefined ? undefined : [...callerCache], fixture.name + " exact caller cache on failure");
      if (fixture.throwClock) assert.equal(requests, 1, fixture.name + " no calls after failed first clock");
      if (fixture.throwClockAt !== undefined) {
        assert.equal(candidatePorts.filter(event => event.kind === "clock").length, fixture.throwClockAt, fixture.name + " exact successful clock prefix");
        assert.equal(label(headers.at(-2).request.operation), "ReadClock", fixture.name + " rejected preparation/root deadline call");
      }
      assert.equal(label(headers.at(-1).reply.outcome), "ProviderRejected", fixture.name + " final request is rejected; no later requests");
      assert.ok(candidatePorts.at(-1).kind.endsWith("Failure"), fixture.name + " no provider calls after failure");
      if (fixture.name === "private-preparation-capture-provider-error") {
        assert.ok(candidatePorts.some(event => event.kind === "capture"), "private preparation failure after successful capture");
        assert.ok(candidatePorts.some(event => event.kind === "cacheStore" && event.role === "private"), "private preparation failure after private cache write");
      }
      if (fixture.name === "expansion-capture-provider-error") assert.ok(candidatePorts.some(event => event.kind === "cacheStore"), "failure after prior successful capture/cache write");
      cases.push({
        name: fixture.name,
        status: "entry-error-exact",
        requests,
        steps
      });
      session.close();
      continue;
    }
    if (failed) {
      assert.equal(label(progress), "DriverFailed", fixture.name);
      assert.equal(label(progress.failure), "NegativeGraphWork", fixture.name);
      cases.push({
        name: fixture.name,
        status: "native-technical-failure",
        requests
      });
      session.close();
      continue;
    }
    if (rust) {
      const snapshot = nativePreparation.preparationObservation,
        entryState = entry.state;
      assert.equal(label(entryState.preparation), snapshot === undefined ? "None" : "Some", fixture.name + " same-invocation preparation presence");
      if (snapshot !== undefined) {
        const prep = entryState.preparation.value;
        assert.deepEqual(canonical(prep.graph), canonical(snapshot.state), fixture.name + " complete preparation bounded graph");
        const commands = {
          NoCommand: "none",
          ResolveEdge: "resolveEdge",
          CheckPath: "checkPath",
          ReadSource: "readSource",
          UnitComplete: "unitComplete",
          UnitIncomplete: "unitIncomplete",
          SkipImport: "skipImport"
        };
        assert.equal(commands[label(prep.command)], snapshot.command.kind);
        for (const key of ["edge", "target"]) if (key in snapshot.command) assert.equal(Number(prep.command[key]), snapshot.command[key]);
        if (snapshot.command.reason) assert.equal(label(prep.command.reason), snapshot.command.reason);
        assert.equal(prep.invalid, snapshot.invalid);
        assert.equal(Number(prep.next_edge), snapshot.nextEdge);
        assert.equal(Number(prep.next_target), snapshot.nextTarget);
        assert.deepEqual(unlist(prep.tasks).map(item => [Number(item.id), rustTask(item.task)]), snapshot.tasks);
        assert.deepEqual(unlist(prep.targets).map(item => [item.path, Number(item.id)]), snapshot.targets);
        assert.deepEqual(label(prep.active) === "None" ? undefined : rustTask(prep.active.value), snapshot.active);
        assert.deepEqual(unlist(prep.dependencies), snapshot.accumulatedDependencies);
        assert.deepEqual(unlist(prep.roles).map(rustRole), snapshot.roles);
        assert.deepEqual(rustRole(entryState.frontend.value.context), snapshot.options ?? {}, fixture.name + " exact root RustContext including absent versus empty modules");
        const actualLimits = entryState.limits;
        for (const [key, value] of Object.entries(snapshot.remaining)) assert.equal(Number(actualLimits[{
          sourceBytes: "source_bytes",
          treeBytes: "tree_bytes",
          readBytes: "read_bytes",
          outgoingEdges: "outgoing_edges"
        }[key] ?? key]), value, fixture.name + " remaining preparation limit " + key);
        assert.deepEqual(unlist(entryState.dependencies), snapshot.dependencies);
        assert.deepEqual(preparationCacheSnapshot ?? session.cacheSnapshot(entryState.preparation_cache.value), snapshot.captures, fixture.name + " private/caller effective preparation cache at handoff");
      }
      assert.deepEqual(actualRustCalls, nativeRust.frontendCalls, fixture.name + " exact requested root/imported Rust contexts and raw parser calls");
      if (context.branch === "function") assert.equal(actualRustCalls.length, 0, "Rust function branch must not invoke raw source parser");
    }
    if (!native) {
      assert.equal(label(progress), "EntryFinished", fixture.name + " independent pre-frame result");
      const reason = nativeModule.preFrameReason;
      assert.ok(reason, fixture.name + " normal return reason observed");
      if (fixture.expectedReason) assert.equal(reason.reason, fixture.expectedReason, fixture.name + " native selected return branch");
      if (fixture.expectedStage) assert.equal(label(entry.state.stage), fixture.expectedStage, fixture.name + " Bend corresponding terminal stage");
      if (reason.binding) {
        assert.deepEqual(canonical(entry.state.limits), canonical(g("Limits", Object.fromEntries(Object.entries(reason.binding.limits).map(([key, value]) => [{
          sourceBytes: "source_bytes",
          treeBytes: "tree_bytes",
          readBytes: "read_bytes",
          outgoingEdges: "outgoing_edges"
        }[key] ?? key, BigInt(value)])))), fixture.name + " preframe effective limits");
        assert.deepEqual(unlist(entry.state.dependencies), reason.binding.dependencies, fixture.name + " preframe prepared dependencies");
      }
      const snapshot = nativeModule.preFrameObservation;
      if (snapshot === undefined) assert.equal(label(entry.retained), "None", fixture.name + " no invented constructed tree");
      assert.equal(label(entry.state.root_local), snapshot === undefined ? "None" : "Some", fixture.name + " preframe local state presence");
      if (snapshot) {
        const local = entry.state.root_local.value,
          budget = local.budget;
        assert.equal(label(entry.retained), "Some", fixture.name + " rejected built root retained");
        const retained = entry.retained.value,
          artifacts = unlist(retained.source.artifacts),
          owners = new Map();
        const expectedKinds = {
            AnyKind: undefined,
            TypeKind: "type",
            FunctionKind: "function"
          },
          reasons = {
            Unresolved: "unresolved",
            UnsupportedTarget: "unsupported",
            ReferenceLimit: "reference-limit",
            Unavailable: "unavailable"
          };
        function compareTree(tree, node) {
          assert.ok(!owners.has(Number(tree.address)), fixture.name + " unique recursive address");
          owners.set(Number(tree.address), node);
          const entries = artifacts.filter(entry => Number(entry.handle) === Number(tree.artifact));
          assert.equal(entries.length, 1);
          assert.deepEqual(canonical(entries[0].value), canonical(artifact(node.artifact)), fixture.name + " rejected node artifact");
          const refs = unlist(tree.references);
          assert.equal(refs.length, node.references.length);
          for (let index = 0; index < refs.length; index++) {
            const ref = refs[index],
              expected = node.references[index],
              outcome = ref.outcome;
            assert.equal(ref.symbol, expected.site.symbol);
            if (label(outcome) === "Expanded") {
              assert.equal(expected.kind, "expanded");
              compareTree(outcome.tree, expected.node);
            } else if (label(outcome) === "Included") {
              assert.equal(expected.kind, "included");
              assert.equal(outcome.identity, expected.target);
            } else {
              assert.equal(expected.kind, "omitted");
              assert.equal(reasons[label(outcome.reason)], expected.reason);
              assert.equal(outcome.target, expected.target.symbol);
            }
          }
        }
        compareTree(retained.tree, snapshot.built.node);
        const pending = unlist(local.pending_rev).reverse();
        assert.equal(pending.length, snapshot.built.pending.length);
        for (let index = 0; index < pending.length; index++) {
          const actual = pending[index],
            expected = snapshot.built.pending[index];
          assert.equal(owners.get(Number(actual.owner)), expected.owner, fixture.name + " rejected pending owner");
          assert.deepEqual([Number(actual.index), actual.from, actual.symbol, actual.name, Number(actual.depth), expectedKinds[label(actual.expected)]], [expected.index, expected.from, expected.symbol, expected.name, expected.depth, expected.expectedKind]);
          if (expected.bundled === undefined) {
            assert.equal(label(actual.target), "Imported");
            assert.deepEqual([actual.target.path, actual.target.name], [expected.importPath, expected.name]);
          } else {
            assert.equal(label(actual.target), "BundledTarget");
            const position = artifacts.findIndex(entry => Number(entry.handle) === Number(actual.target.declaration));
            assert.ok(position >= 0);
            const sourceReply = headers.map(event => event.reply?.outcome).findLast(outcome => outcome && label(outcome) === "FrontendResult" && label(outcome.outcome) === "SourceInspected").outcome.facts;
            const declarations = [...unlist(sourceReply.declarations), ...unlist(sourceReply.supporting)];
            assert.equal(artifacts.length, declarations.length);
            const withoutKey = value => Object.fromEntries(Object.entries(canonical(value)).filter(([key]) => key !== "key"));
            assert.deepEqual(withoutKey(declarations[position]), withoutKey(unlist(sourceFacts({
              ...expected.bundled.file,
              declarations: new Map([["selected", expected.bundled.declaration]])
            }).declarations)[0]), fixture.name + " rejected bundled full declaration");
            assert.deepEqual(canonical(sourceReply), canonical(sourceFacts(expected.bundled.file)), fixture.name + " rejected bundled complete source facts");
          }
        }
        if (fixture.name === "root-local-work-refused") assert.ok(pending.length > 0, fixture.name + " retained nonempty pending");
        if (fixture.name === "root-bundled-work-refused") assert.ok(pending.some(item => label(item.target) === "BundledTarget"), fixture.name + " retained bundled pending");
        const entries = map => label(map) === "MTip" ? [] : label(map) === "MLeaf" ? [[map.key, map.val]] : [...entries(map.lo), ...entries(map.hi)];
        const normalized = items => items.sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
        assert.deepEqual(normalized(entries(budget.targets_by_path).map(([path, values]) => [path, mapKeys(values).sort()])), normalized([...snapshot.budget.targetsByPath].map(([path, values]) => [path, [...values].sort()])), fixture.name + " rejected complete path budgets");
        assert.deepEqual(mapKeys(local.visited).sort(), snapshot.visited.slice().sort(), fixture.name + " rejected root visited");
        assert.deepEqual([budget.work, budget.max_depth, budget.max_targets, budget.graph_work].map(Number), [snapshot.budget.work, snapshot.budget.maxDepth, snapshot.budget.maxTargetsInFile, snapshot.budget.graphWork], fixture.name + " rejected root budget scalars");
        assert.equal(entry.state.selected_root_identity.value, snapshot.rootDeclaration.artifact.id, fixture.name + " rejected selected identity");
        assert.deepEqual(Object.fromEntries(Object.entries(canonical(entry.state.limits)).filter(([key]) => key !== "$")), Object.fromEntries(Object.entries(snapshot.binding.limits).map(([key, value]) => [{
          sourceBytes: "source_bytes",
          treeBytes: "tree_bytes",
          readBytes: "read_bytes",
          outgoingEdges: "outgoing_edges"
        }[key] ?? key, value])), fixture.name + " rejected effective limits");
        assert.deepEqual(unlist(entry.state.dependencies), snapshot.binding.dependencies, fixture.name + " rejected preparation dependencies");
      }
      cases.push({
        name: fixture.name,
        status: snapshot ? "pre-frame-rejected-root-exact" : "pre-frame-branch-exact",
        reason: reason.reason,
        stage: label(entry.state.stage),
        requests,
        steps
      });
      session.close();
      continue;
    }
    if (label(progress) !== "DriverFinished") writeFileSync("/tmp/hapsland-driver-failed-" + fixture.name + ".json", JSON.stringify({
      trace,
      progress
    }, (_k, v) => typeof v === "bigint" ? String(v) : v, 2));
    assert.equal(label(progress), "DriverFinished", fixture.name + " terminal");
    const actual = label(progress.product) === "None" ? undefined : fromProductValue(progress.product.value);
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), fixture.name + " exact returned product/order");
    const final = progress.state.frame;
    const expectedLimits = g("Limits", Object.fromEntries(Object.entries(native.limits).map(([k, v]) => [{
      sourceBytes: "source_bytes",
      treeBytes: "tree_bytes",
      readBytes: "read_bytes",
      outgoingEdges: "outgoing_edges"
    }[k] ?? k, BigInt(v)])));
    let graph = policy.bounded_initial(expectedLimits),
      command = g("NoCommand");
    for (const e of nativeEvents) {
      const step = policy.bounded_transition(graph, event(e));
      graph = step.state;
      command = step.command;
    }
    assert.deepEqual(canonical(final.graph), canonical(native.state), fixture.name + " actual production bounded graph");
    assert.deepEqual(canonical(final.graph), canonical(graph), fixture.name + " reference replay bounded graph");
    assert.deepEqual(canonical(final.command), canonical(command));
    assert.deepEqual(unlist(progress.state.ids).map(x => [x.key, Number(x.id)]), [...native.targetIds], fixture.name + " ordered target IDs");
    assert.equal(Number(progress.state.next_target), native.nextTargetId);
    assert.equal(Number(final.next_edge), native.nextId);
    assert.deepEqual(mapKeys(final.local.local.visited).sort(), [...native.visited].sort(), fixture.name + " visited membership");
    const signed = final.local.graph_work,
      signedWork = (label(signed) === "Negative" ? -1 : 1) * Number(signed.value ?? signed.magnitude);
    assert.equal(signedWork, native.budget.graphWork, fixture.name + " retained signed graph work");
    const budget = final.local.local.budget;
    assert.deepEqual(Object.fromEntries(Object.entries(canonical(budget.limits)).filter(([k]) => k !== "$")), {
      work: native.limits.work,
      depth: native.limits.depth,
      targets: native.limits.outgoingEdges
    }, fixture.name + " local budget limits");
    const mapEntries = value => label(value) === "MTip" ? [] : label(value) === "MLeaf" ? [[value.key, value.val]] : [...mapEntries(value.lo), ...mapEntries(value.hi)];
    assert.deepEqual(mapEntries(budget.targets_by_path).map(([p, values]) => [p, mapKeys(values).sort()]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0), [...native.budget.targetsByPath].map(([p, values]) => [p, [...values].sort()]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0), fixture.name + " targets by path including empty entries");
    assert.deepEqual([budget.work, budget.max_targets, budget.max_depth].map(Number), [native.budget.work, native.budget.maxTargetsInFile, native.budget.maxDepth], fixture.name + " retained budget");
    assert.deepEqual(unlist(final.identities).map(x => [Number(x.target), x.identity]), [...native.artifactsByTarget]);
    assert.deepEqual(unlist(final.captured).map(x => [x.path, Number(x.bytes), canonical(x.source)]), [...native.captured].map(([p, x]) => [p, x.sourceBytes, canonical(sourceFacts(x.file))]), fixture.name + " ordered captured source facts");
    const address = x => [Number(x.episode), unlist(x.route).map(Number)],
      addressKey = x => JSON.stringify(x);
    const nodeEntries = unlist(final.forest.nodes).map(n => [addressKey(address(n.address)), n]);
    assert.equal(new Set(nodeEntries.map(([key]) => key)).size, nodeEntries.length, fixture.name + " unique retained construction addresses");
    const candidateNodes = new Map(nodeEntries);
    const expectedKinds = {
      AnyKind: undefined,
      TypeKind: "type",
      FunctionKind: "function"
    };
    const withoutKey = x => Object.fromEntries(Object.entries(canonical(x)).filter(([key]) => key !== "key"));
    const nativeDeclaration = (decl, file) => withoutKey(unlist(sourceFacts({
      ...file,
      declarations: new Map([[decl.artifact.name, decl]])
    }).declarations)[0]);
    const candidateBundle = edge => {
      const handle = Number(edge.pending.value.target.declaration),
        entries = unlist(edge.catalog.artifacts),
        declarations = [...unlist(edge.source.declarations), ...unlist(edge.source.supporting)],
        indices = entries.flatMap((entry, index) => Number(entry.handle) === handle ? [index] : []);
      assert.equal(indices.length, 1, fixture.name + " unique bundled catalog handle");
      assert.equal(entries.length, declarations.length, fixture.name + " retained source/catalog pairing");
      return {
        kind: "bundled",
        artifact: canonical(entries[indices[0]].value),
        declaration: withoutKey(declarations[indices[0]]),
        source: canonical(edge.source)
      };
    };
    const candidatePending = edge => {
      const x = edge.pending.value;
      return {
        id: Number(edge.id),
        owner: address(edge.pending.owner),
        index: Number(x.index),
        from: x.from,
        symbol: x.symbol,
        name: x.name,
        depth: Number(x.depth),
        expectedKind: expectedKinds[label(x.expected)],
        target: label(x.target) === "Imported" ? {
          kind: "imported",
          path: x.target.path,
          name: x.target.name
        } : candidateBundle(edge)
      };
    };
    const nativePending = (id, x) => ({
      id,
      owner: birthAddress(x.owner),
      index: x.index,
      from: x.from,
      symbol: x.symbol,
      name: x.name,
      depth: x.depth,
      expectedKind: x.expectedKind,
      target: x.bundled ? {
        kind: "bundled",
        artifact: canonical(artifact(x.bundled.declaration.artifact)),
        declaration: nativeDeclaration(x.bundled.declaration, x.bundled.file),
        source: canonical(sourceFacts(x.bundled.file))
      } : {
        kind: "imported",
        path: x.importPath,
        name: x.name
      }
    });
    assert.deepEqual(unlist(final.pending).map(candidatePending), [...native.pending].map(([id, x]) => nativePending(id, x)), fixture.name + " full ordered pending payload and birth owners");
    const candidateTargets = unlist(progress.state.targets).map(({
      id,
      target
    }) => ({
      id: Number(id),
      edge: candidatePending(target.edge),
      ...(label(target) === "FileTarget" ? {
        kind: "file",
        path: target.path,
        name: target.name
      } : {
        kind: "bundled",
        declaration: withoutKey(target.declaration),
        source: canonical(target.source)
      })
    }));
    const nativeTargets = [...native.pathForTarget].map(([id, x]) => ({
      id,
      edge: nativePending([...native.pending].find(([, value]) => value === x.edge)?.[0], x.edge),
      ...(x.kind === "file" ? {
        kind: "file",
        path: x.path,
        name: x.name
      } : {
        kind: "bundled",
        declaration: nativeDeclaration(x.declaration, x.file),
        source: canonical(sourceFacts(x.file))
      })
    }));
    assert.deepEqual(candidateTargets, nativeTargets, fixture.name + " full ordered target payload and owner identity");
    const omissionNames = {
      Unresolved: "unresolved",
      Unavailable: "unavailable",
      UnsupportedTarget: "unsupported",
      ReferenceLimit: "reference-limit"
    };
    const candidateClosure = new Map(),
      nativeClosure = new Map();
    function candidateVisit(key) {
      if (candidateClosure.has(key)) return;
      const node = candidateNodes.get(key);
      assert.ok(node, fixture.name + " retained candidate owner");
      const refs = unlist(node.references).map(ref => label(ref) === "Expanded" ? {
        kind: "expanded",
        symbol: ref.symbol.text,
        child: address(ref.child)
      } : label(ref) === "Included" ? {
        kind: "included",
        symbol: ref.symbol.text,
        target: ref.identity.text
      } : {
        kind: "omitted",
        symbol: ref.symbol.text,
        target: ref.target.text,
        reason: omissionNames[label(ref.reason)]
      });
      candidateClosure.set(key, {
        artifact: canonical(node.artifact),
        references: refs
      });
      for (const ref of refs) if (ref.kind === "expanded") candidateVisit(addressKey(ref.child));
    }
    function nativeVisit(node) {
      const key = addressKey(birthAddress(node));
      if (nativeClosure.has(key)) return;
      nativeClosure.set(key, {
        artifact: canonical(artifact(node.artifact)),
        references: node.references.map(ref => ref.kind === "expanded" ? {
          kind: "expanded",
          symbol: ref.site.symbol,
          child: birthAddress(ref.node)
        } : ref.kind === "included" ? {
          kind: "included",
          symbol: ref.site.symbol,
          target: ref.target
        } : {
          kind: "omitted",
          symbol: ref.site.symbol,
          target: ref.target.symbol,
          reason: ref.reason
        })
      });
      for (const ref of node.references) if (ref.kind === "expanded") nativeVisit(ref.node);
    }
    candidateVisit(addressKey(address(final.forest.root.value)));
    for (const x of unlist(final.pending)) candidateVisit(addressKey(address(x.pending.owner)));
    for (const x of unlist(progress.state.targets)) candidateVisit(addressKey(address(x.target.edge.pending.owner)));
    nativeVisit(native.unit.root);
    const nativeRootKeys = new Set(nativeClosure.keys());
    for (const x of native.pending.values()) nativeVisit(x.owner);
    for (const x of native.pathForTarget.values()) nativeVisit(x.edge.owner);
    assert.deepEqual([...candidateClosure].sort(), [...nativeClosure].sort(), fixture.name + " retained root/pending/target-owner forest closure including detached rollback children");
    const detachedOwnerClosure = [...nativeClosure.keys()].filter(key => !nativeRootKeys.has(key)).length;
    if (fixture.name === "rollback-pending-owner") assert.ok(detachedOwnerClosure > 0, "explicit rollback fixture must retain a detached pending-owner closure");
    assert.deepEqual(callerCache === undefined ? undefined : [...callerCache], cache === undefined ? undefined : [...cache], fixture.name + " caller cache mutations/order");
    assert.equal(Number(progress.state.next_request), 1 + requests);
    cases.push({
      name: fixture.name,
      status: "full-entry-exact",
      requests,
      steps,
      retainedNodes: nativeClosure.size,
      detachedOwnerClosure,
      returned: actual !== undefined
    });
    session.close();
  }
  assert.deepEqual(hashes(), sources, "verification sources frozen");
  const record = {
    at: new Date().toISOString(),
    runtime: typeof Bun === "undefined" ? "node" : "bun",
    sources,
    cases,
    mechanicalPathCoverage: "Runtime-only emitted callback bridges call actual node:path and record every argument/result, including eager pure branches; no fixture tables or native oracle seed. Absolute uses fixed POSIX startsWith slash. This harness bridge does not qualify a production foreign binding.",
    semanticPortsQualified: "Same-invocation ordered clock samples, lstat status, access decisions/relative paths, capture invocation paths/caps/full returned payload; full frontend/Cargo/module parser results; caller/private cache writes and diagnostics. Events published as actual Environment ProviderEffect deltas with exact request/reply header pairing. Four injected synchronous Error cases (first-clock, caller/private preparation-capture, expansion-capture) with fixed immutable fixture payloads qualify original error identity, exact ordered effect prefix and caller-cache snapshot; effective preparation cache snapshots are compared before cleanup on both caller and private capture failures. Other provider errors and interruption remain unqualified.",
    constructionEpisodeConvention: "Root and child builds that reach attachment, including later rollback; rejects before attachment do not consume an observable episode. Addresses use original routes before slot rewrites and actual JS node identity.",
    wrapperHashes,
    emissionHashes,
    compiledWrapperCount: compiledWrappers.size,
    rustPreparationProviderBoundary: "Native preparation is the same-invocation oracle only; providers use raw TOML/module/source frontends and exact requested RustContext. Effective private preparation cache is observed separately from caller cache.",
    scope: "Complete independent TypeScript/Rust/Bend entry/preparation/root/expansion driver against real native graphIteration, actual access/filesystem/parser and fixture capture provider. Exact product/property order, bounded graph/command, target IDs/allocation, visited set, budget scalars/signed graph work/limits/all target-path entries, capture facts/identity publication, full ordered pending/target payloads and retained owner forest closure, cache and request chronology. Four injected synchronous provider Error cases qualify ordered failure prefixes and original Error identity before cleanup, with immutable fixture payloads and caller-cache snapshots; effective preparation cache failure snapshots are also compared; other provider failures, complete pre-frame retained state, physical cancellation/late cleanup, universal completion/proofs and candidate performance remain unqualified by this harness."
  };
  writeFileSync(path.join(folder, "entry-specification-" + record.runtime + (process.env.HAPSLAND_ENTRY_FIXTURE === undefined ? "" : "-fixture") + "-evidence.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify({
    runtime: record.runtime,
    cases: cases.length,
    compared: cases.filter(x => x.status === "full-entry-exact").length
  }));
} finally {
  delete globalThis.__hapslandEntryPath;
  delete globalThis.__hapslandExpansionPathQueries;
  rmSync(wrapperPath, {
    force: true
  });
  rmSync(temporary, {
    recursive: true,
    force: true
  });
}
