import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import { eligibleNamedPath, contextDirectFilePolicy, DEFAULT_DIRECT_FILE_POLICY } from "../../../packages/native-observation/dist/direct-event/selection.js";
import { GRAPH_LIMIT_CEILINGS } from "../../../packages/canonical-policy/dist/canonical/graph-limits.js";
import { languageForPath as __languageForPath } from "../../../packages/source-analysis/dist/direct-event/languages/registry.js";
import { createGraphFixtures } from "./fixtures.mjs";
import { sourceFacts, artifact } from "../../../packages/source-analysis/src/direct-event/graph-resolution/frontend-codec.mjs";
import { createServiceSession, list, unlist, fromProductValue, binary64 as __binary64 } from "../../../packages/source-analysis/src/direct-event/graph-resolution/service-session.mjs";

// Full post-root expansion interpreter, using actual filesystem/access/parser
// services. Preparation and the universal whole-observer relation remain gates.
const folder = import.meta.dirname,
  root = path.resolve(folder, "../../..");
mkdirSync(path.join(root, "node_modules/.cache"), {
  recursive: true
});
const temporary = mkdtempSync(path.join(root, "node_modules/.cache/expansion-driver-"));
const wrapperPath = path.join(folder, ".expansion-driver-" + path.basename(temporary) + ".bend");
const tag = (name, fields = {}) => ({
    $: name,
    ...fields
  }),
  label = v => v.$.split(".").at(-1);
const t = (name, fields = {}) => tag("Types." + name, fields),
  d = (name, fields = {}) => tag("ExpansionDriverSpecification." + name, fields);
const g = (name, fields = {}) => tag("../../../../agent-flow-bend/ImportGraph." + name, fields);
const maybe = v => v === undefined ? tag("None") : tag("Some", {
  value: v
});
const canonical = v => typeof v === "bigint" ? Number(v) : Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "$" ? label(v) : canonical(x)])) : v;
const qualify = (v, prefix, names) => v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "$" && names.has(x) ? prefix + "." + x : qualify(x, prefix, names)])) : v;
const forestNames = new Set(["Forest", "Node", "Pending", "ReferenceSymbol", "ArtifactIdentity", "Included", "Expanded", "Omitted"]);
const fq = v => qualify(v, "ForestSpecification", forestNames);
const rawFixtures = createGraphFixtures();
const fixtures = rawFixtures.filter(f => !(f.path ?? "root.ts").endsWith(".rs"));
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
const source = f => f.source ?? `import type { A } from '${f.importPath ?? "./a"}'; export interface Root { a: A }`;
function pathTables() {
  const names = new Set(),
    leaves = new Set(),
    dirs = new Set(["."]),
    joins = new Map();
  for (const f of fixtures) for (const [name, text] of [[f.path ?? "root.ts", source(f)], ...Object.entries(f.files)]) {
    names.add(name);
    dirs.add(path.dirname(name));
    for (const m of text.matchAll(/\bfrom\s+['"]([^'"]+)['"]|^import\s+(\.{1,2}\/\S+)/gm)) leaves.add(m[1] ?? m[2]);
  }
  for (const dir of dirs) for (const leaf of leaves) {
    const joined = path.join(dir, leaf);
    joins.set([dir, leaf].join("|") + "|", joined);
    names.add(joined);
    for (const ext of [".ts", ".tsx", ".mts", ".cts"]) names.add(joined + ext);
    for (const ext of [".js", ".mjs", ".cjs"]) if (joined.toLowerCase().endsWith(ext)) for (const target of [".ts", ".tsx", ".mts", ".cts"]) names.add(joined.slice(0, -ext.length) + target);
  }
  for (const leaf of leaves) names.add(leaf);
  return {
    join: joins,
    dirname: new Map([...names].map(n => [n, path.dirname(n)])),
    extension: new Map([...names].map(n => [n, path.extname(n)])),
    normalize: new Map([...names].map(n => [n, path.normalize(n)])),
    relative: new Map([[".|.", "."]])
  };
}
function wrapper(tables) {
  let text = "import Base\nimport ./ExpansionDriverSpecification.bend as D\nimport ./ExpansionSpecification.bend as X\nimport ./Types.bend as T\nimport ./Environment.bend as E\nimport ./WholeObservation.bend as O\n";
  text += 'def path_read(result: Map<&2, String> & String) -> String:\n  match result:\n    case Tuple{_, value}: value\ndef path_get(table: Map<&2, String>, key: String) -> String:\n  path_read(Map.get(String, "__MISSING_PATH_FACT__", table, key))\ndef join_key(parts: List<&2, String>) -> String:\n  match parts:\n    case []: ""\n    case head <> tail: head ++ "|" ++ join_key(tail)\n';
  for (const [kind, table] of Object.entries(tables)) {
    const entries = [...table].map(([k, v]) => `(${JSON.stringify(k)}, ${JSON.stringify(v)})`),
      chunks = [];
    for (let i = 0; i < entries.length; i += 48) {
      const n = kind + "_chunk_" + i;
      chunks.push(n + "()");
      text += `def ${n}() -> List<&2, Sigma<&2, &2, String, _ => String>>:\n  [${entries.slice(i, i + 48).join(",")}]\n`;
    }
    const values = chunks.reduceRight((rest, c) => `List.append(&2, Sigma<&2, &2, String, _ => String>, ${c}, ${rest})`, "[]");
    text += `def ${kind}_table() -> Map<&2, String>:\n  Map.from_list(&2, String, ${values})\n`;
    text += kind === "join" ? `def join(parts: List<&2, String>) -> String:\n  path_get(join_table(), join_key(parts))\n` : kind === "relative" ? `def relative(from: String, to: String) -> String:\n  path_get(relative_table(), from ++ "|" ++ to)\n` : `def ${kind}(value: String) -> String:\n  path_get(${kind}_table(), value)\n`;
  }
  return text + `def absolute(value: String) -> Bool:\n  String.starts_with(value, "/")\ndef expired(bits: T.Binary64) -> Bool:\n  match bits:\n    case T.Binary64{high, _}: U32.is_gt(high, 0)\ndef selection(state: D.State) -> D.Selection:\n  D.choose(~absolute, ~dirname, ~join, ~normalize, ~extension, "/", 10000n, state)\ndef reply(state: D.State, outcome: T.ServiceOutcome) -> D.Selection:\n  D.consume(~dirname, ~join, ~relative, ~expired, state, outcome)\ndef suspend(operation: T.Operation, world: Nat) -> E.Response<Nat>:\n  match world:\n    case +sequence: E.Suspended{(sequence + 1n : Nat), O.ProviderLease{1n, sequence}, []}\ndef initial(config: D.Config, frame: X.Frame, ids: List<&2, D.TargetId>) -> D.Progress<Nat>:\n  D.DriverReady{D.begin(config, frame, [], ids, 2n, 37n), E.WorldState{0n, []}}\ndef advance(progress: D.Progress<Nat>) -> D.Progress<Nat>:\n  D.advance(~selection, ~reply, Nat, suspend, progress)\ndef complete(progress: D.Progress<Nat>, completion: E.Completion<Nat>) -> D.Progress<Nat>:\n  D.complete(~reply, Nat, progress, completion)\ndef cancel(progress: D.Progress<Nat>) -> D.Progress<Nat>:\n  D.cancel(Nat, progress)\ndef main() -> Unit:\n  Unit{}\n`;
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
  const tables = pathTables();
  writeFileSync(wrapperPath, wrapper(tables));
  const nativePath = path.join(root, "packages/source-analysis/dist/direct-event/graph-resolver.js");
  const dependencies = ["../../../packages/source-analysis/src/direct-event/graph-resolution/ExpansionDriverSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/ExpansionSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/ForestSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/SignedLocalSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/SPEC.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/GraphSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/RustSpecification.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/WholeObservation.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/Environment.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/Types.bend", "./expansion-driver-check.mjs", "./fixtures.mjs", "../../../packages/source-analysis/src/direct-event/graph-resolution/frontend-codec.mjs", "../../../packages/source-analysis/src/direct-event/graph-resolution/service-session.mjs", "../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/SPEC.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/core.bend", "../../../packages/source-analysis/src/direct-event/graph-resolution/traversal/Traversal.bend", "../../../bun.lock", nativePath];
  const hashes = () => Object.fromEntries(dependencies.map(n => [n, createHash("sha256").update(readFileSync(path.isAbsolute(n) ? n : path.join(folder, n))).digest("hex")]));
  const sources = hashes(),
    cases = [];
  async function compile(name, file = path.join(folder, name + ".bend")) {
    const output = path.join(temporary, name + ".mjs");
    execFileSync("bend", [file, "-o", output], {
      timeout: 5000,
      maxBuffer: 2 ** 20
    });
    if (name === "DriverCheck") {
      let js = readFileSync(output, "utf8");
      for (const kind of Object.keys(tables)) {
        const pattern = new RegExp("function \\$" + kind + "\\$\\(([^)]*)\\) \\{");
        assert.ok(pattern.test(js), kind + " mechanical primitive exists");
        js = js.replace(pattern, (all, args) => all + `\n globalThis.__hapslandExpansionPathQueries.push({kind:${JSON.stringify(kind)},args:[${args}]});`);
      }
      writeFileSync(output, js);
    }
    return (await import(pathToFileURL(output))).default;
  }
  const bound = await compile("DriverCheck", wrapperPath),
    spec = await compile("SPEC"),
    forest = await compile("ForestSpecification"),
    policy = await compile("GraphSpecification");
  const nativeCopy = path.join(temporary, "native.mjs"),
    nativeSource = readFileSync(nativePath, "utf8").replaceAll(/from "(\.{1,2}\/[^"]+)"/g, (_all, n) => `from "${pathToFileURL(path.join(path.dirname(nativePath), n))}"`);
  const instrument = (text, needle, replacement) => {
    assert.equal(text.split(needle).length, 2, "unique native observer anchor " + needle);
    return text.replace(needle, replacement);
  };
  let observed = instrument(nativeSource, "const transition = stepImportGraph(frame.state, event)", "nativeEvents.push(event); const transition = stepImportGraph(frame.state, event)");
  observed = instrument(observed, "const attachCapturedChild = (frame, targetId, target, path, source, file, declaration, child, localWorkBefore, visited) => {", "const attachCapturedChild = (frame, targetId, target, path, source, file, declaration, child, localWorkBefore, visited) => { registerBirth(child.node);");
  observed = instrument(observed, 'target.edge.owner.references[target.edge.index] = {\n        kind: "expanded",', 'registerBirth(child.node); target.edge.owner.references[target.edge.index] = {\n        kind: "expanded",');
  writeFileSync(nativeCopy, observed + `\nconst nativeEvents=[]; let birth=new WeakMap(),episode=0;
 function resetBirth(){birth=new WeakMap();episode=0}
 function registerBirth(root){const current=++episode;function visit(node,route){if(birth.has(node))throw Error('node birth was renamed');birth.set(node,[current,route]);for(const [index,reference]of node.references.entries())if(reference.kind==='expanded')visit(reference.node,[...route,index])}visit(root,[])}
 function birthAddress(node){const value=birth.get(node);if(value===undefined)throw Error('unobserved node construction');return value}
 export {prepareGraphFrame,graphIteration,nativeEvents,resetBirth,registerBirth,birthAddress};\n`);
  const {
    prepareGraphFrame,
    graphIteration,
    nativeEvents,
    resetBirth,
    registerBirth,
    birthAddress
  } = await import(pathToFileURL(nativeCopy));
  for (const fixture of fixtures) {
    globalThis.__hapslandExpansionPathQueries = [];
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
      cache = fixture.cache === undefined ? undefined : new Map(fixture.cache);
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
      now: () => ticks++ >= (fixture.expireAt ?? Infinity) ? 5000 : 0,
      captureSource: (_root, selection) => Effect.succeed(fixture.unavailable ? {
        status: "unavailable",
        diagnostic: {
          stage: "capture",
          code: "fixture-unavailable",
          args: {}
        }
      } : {
        status: "captured",
        capture: stable(selection.relativePath)
      })
    };
    nativeEvents.length = 0;
    resetBirth();
    const native = await Effect.runPromise(prepareGraphFrame(selected, stable(selected), "Root", context));
    if (!native) {
      cases.push({
        name: fixture.name,
        status: "pre-frame-excluded"
      });
      continue;
    }
    registerBirth(native.unit.root);
    const prefixTicks = ticks,
      facts = native.session.inspect(selected, source(fixture), context.branch),
      encoded = sourceFacts(facts),
      catalog = spec.source(encoded, 0n);
    const limits = g("Limits", Object.fromEntries(Object.entries({
      version: 1,
      ...native.limits
    }).map(([k, v]) => [{
      sourceBytes: "source_bytes",
      treeBytes: "tree_bytes",
      readBytes: "read_bytes",
      outgoingEdges: "outgoing_edges"
    }[k] ?? k, BigInt(v)])));
    const built = spec.root(10000n, catalog, selected, "Root", t(context.branch === "function" ? "FunctionBranch" : "TypeBranch"), limits);
    assert.equal(label(built), "RootBuilt");
    const created = forest.construct(10000n, built.tree, 1n, list([]), built.source.artifacts);
    assert.equal(label(created), "Constructed");
    const semantic = tag("Forest", {
        root: maybe(created.created.root),
        nodes: created.created.nodes
      }),
      pending = forest.pending(list(unlist(built.state.pending_rev).reverse()), created.created.addresses);
    assert.equal(label(pending), "PendingBuilt");
    let graph = policy.bounded_initial(limits),
      command = g("NoCommand");
    for (const e of nativeEvents) {
      const step = policy.bounded_transition(graph, event(e));
      graph = step.state;
      command = step.command;
    }
    const frame = tag("ExpansionSpecification.Frame", {
      graph,
      command,
      forest: fq(semantic),
      local: tag("SignedLocalSpecification.State", {
        local: built.state,
        graph_work: tag("WholeObservation.Nonnegative", {
          value: 0n
        })
      }),
      pending: list(unlist(pending.pending).map((item, i) => tag("ExpansionSpecification.Edge", {
        id: BigInt(i + 1),
        pending: fq(item),
        source: encoded,
        catalog: {
          ...built.source,
          $: "SPEC.Source"
        }
      }))),
      captured: list([tag("ExpansionSpecification.Captured", {
        path: selected,
        source: encoded,
        bytes: BigInt(stable(selected).byteLength)
      })]),
      identities: list([tag("ExpansionSpecification.TargetArtifact", {
        target: 1n,
        identity: native.unit.root.artifact.id
      })]),
      next_edge: BigInt(native.nextId),
      next_episode: 2n,
      next_artifact: built.source.next_artifact,
      dependencies: list(native.dependencies)
    });
    const callerCache = cache === undefined ? undefined : new Map(cache);
    let clockReads = 0;
    const session = createServiceSession({
      invocation: 1,
      root: directory,
      callerCache,
      now: () => clockReads++ === 0 ? 0 : prefixTicks + clockReads - 2 >= (fixture.expireAt ?? Infinity) ? 5000 : 0,
      access: n => Effect.runPromise(eligibleNamedPath(directory, n, contextDirectFilePolicy(context.policy))),
      capture: selection => Effect.runPromise(context.captureSource(directory, selection)),
      frontend: (n, text, frontend) => {
        assert.equal(label(frontend), selected.endsWith(".bend") ? "BendSourceContext" : "TypeScriptContext");
        const facts = native.session.inspect(n, text, context.branch);
        return facts === undefined ? undefined : sourceFacts(facts);
      }
    });
    const clock = (await session.perform(t("Request", {
      invocation: 1n,
      id: 36n,
      operation: t("StartClock")
    }))).outcome.clock;
    const config = d("Config", {
      invocation: 1n,
      root_path: selected,
      language: t(selected.endsWith(".bend") ? "BendLanguage" : "TypeScriptLanguage"),
      frontend: t(selected.endsWith(".bend") ? "BendSourceContext" : "TypeScriptContext", {
        branch: t(context.branch === "function" ? "FunctionBranch" : "TypeBranch")
      }),
      clock,
      cache: session.callerCache
    });
    const progress = bound.initial(config, frame, list([...native.targetIds].map(([key, id]) => d("TargetId", {
        key,
        id: BigInt(id)
      })))),
      requests = 0,
      steps = 0,
      trace = [];
    while (["DriverReady", "DriverSelected", "DriverWaiting"].includes(label(progress))) {
      assert.ok(++steps < 20000, "mathematical evaluation bound is not normal completion");
      if (["DriverReady", "DriverSelected"].includes(label(progress))) {
        trace.push({
          stage: label(progress.state.stage),
          command: label(progress.state.frame.command)
        });
        progress = bound.advance(progress);
        continue;
      }
      const request = progress.exchange.request;
      trace.push({
        request: label(request.operation)
      });
      assert.equal(Number(request.id), 37 + requests);
      assert.ok(!JSON.stringify(request, (_k, v) => typeof v === "bigint" ? String(v) : v).includes("__MISSING_PATH_FACT__"), "uncovered mechanical path argument");
      const response = await session.perform(request),
        completion = tag("Environment.Completion", {
          lease: progress.exchange.lease,
          world: progress.exchange.state.world,
          outcome: response.outcome,
          effects: list([])
        });
      progress = bound.complete(progress, completion);
      requests++;
    }
    for (const query of globalThis.__hapslandExpansionPathQueries) {
      const key = query.kind === "join" ? unlist(query.args[0]).join("|") + "|" : query.kind === "relative" ? query.args.join("|") : query.args[0];
      assert.ok(tables[query.kind].has(key), fixture.name + " missing evaluated primitive fact " + query.kind + " " + key);
      const host = query.kind === "join" ? path.join(...unlist(query.args[0])) : path[query.kind === "extension" ? "extname" : query.kind](...query.args);
      assert.equal(tables[query.kind].get(key), host, fixture.name + " exact mechanical primitive " + query.kind);
    }
    let expected, failed;
    try {
      for (let i = 0; i < native.limits.work * 8 + 16; i++) {
        const result = await Effect.runPromise(graphIteration(native));
        if (result.done) {
          expected = result.unit;
          break;
        }
      }
    } catch (error) {
      failed = error;
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
    if (label(progress) !== "DriverFinished") writeFileSync("/tmp/hapsland-driver-failed-" + fixture.name + ".json", JSON.stringify({
      trace,
      progress
    }, (_k, v) => typeof v === "bigint" ? String(v) : v, 2));
    assert.equal(label(progress), "DriverFinished", fixture.name + " terminal");
    const actual = label(progress.product) === "None" ? undefined : fromProductValue(progress.product.value);
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), fixture.name + " exact returned product/order");
    const final = progress.state.frame;
    graph = policy.bounded_initial(limits);
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
    assert.equal(Number(progress.state.next_request), 37 + requests);
    cases.push({
      name: fixture.name,
      status: "full-expansion-exact",
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
    mechanicalPathCoverage: "Every evaluated table-backed path primitive argument is checked for table membership and exact host interpretation, including eager pure branches; absolute uses the fixed POSIX startsWith slash interpretation.",
    constructionEpisodeConvention: "Root and child builds that reach attachment, including later rollback; rejects before attachment do not consume an observable episode. Addresses use original routes before slot rewrites and actual JS node identity.",
    pathTablesHash: createHash("sha256").update(wrapper(tables)).digest("hex"),
    scope: "Complete post-root TypeScript/Bend expansion driver against real native graphIteration, actual access/filesystem/parser and fixture capture provider. Exact product/property order, bounded graph/command, target IDs/allocation, visited set, budget scalars/signed graph work/limits/all target-path entries, capture facts/identity publication, full ordered pending/target payloads and retained owner forest closure, cache and request chronology. Rust preparation/context, original error cause identity, physical cancellation/late cleanup, universal completion/proofs and candidate performance remain unqualified."
  };
  writeFileSync(path.join(folder, "expansion-driver-" + record.runtime + "-evidence.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify({
    runtime: record.runtime,
    cases: cases.length,
    compared: cases.filter(x => x.status === "full-expansion-exact").length
  }));
} finally {
  rmSync(wrapperPath, {
    force: true
  });
  rmSync(temporary, {
    recursive: true,
    force: true
  });
}
