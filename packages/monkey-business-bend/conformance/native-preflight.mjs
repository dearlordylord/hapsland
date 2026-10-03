import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { arch, platform, release, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// User-authorized 2026-10-03 amendment: C emission alone increases to 12s after the full diagnostic root emitted successfully in 10.75s.
export const NATIVE_C_EMISSION_TIMEOUT_MS = 12000;

const CLANG_FLAGS = Object.freeze(["-O0", "-Wno-unused-value"]);
const CLANG_LIBRARIES = Object.freeze(["-lm", "-pthread"]);
const created = new WeakSet();
const closed = new WeakSet();
const hash = value => createHash("sha256").update(value).digest("hex");
const fileHash = path => hash(readFileSync(path));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const host = () => ({ platform: platform(), architecture: arch(), release: release() });
const fail = message => { throw new Error(`Native preflight: ${message}`); };

function checked(command, arguments_, timeout) {
  const result = spawnSync(command, arguments_, { encoding: "utf8", timeout,
    env: { ...process.env, BEND_NO_TELEMETRY: "1" } });
  if (result.error || result.status !== 0) {
    const diagnostic = [result.stdout, result.stderr].filter(Boolean).join("\n").slice(-8192);
    throw new Error(`Native preflight: ${basename(command)} failed (${result.error?.code ?? result.status})${diagnostic ? `:\n${diagnostic}` : ""}`, { cause: result.error });
  }
  return result.stdout.trim();
}

function executable(command) {
  const paths = isAbsolute(command) || command.includes(sep)
    ? [resolve(command)]
    : (process.env.PATH ?? "").split(sep === "/" ? ":" : ";").map(path => resolve(path, command));
  for (const candidate of paths) {
    try {
      accessSync(candidate, constants.X_OK);
      const actual = realpathSync(candidate);
      if (lstatSync(actual).isFile()) return actual;
    } catch { /* Continue searching PATH; no shell invocation. */ }
  }
  return fail(`executable not found: ${command}`);
}

function tool(command, arguments_) {
  const path = executable(command);
  const sha256 = fileHash(path);
  const version = checked(path, arguments_, 5000);
  if (!version || fileHash(path) !== sha256) return fail("tool changed during identification");
  return { path, sha256, version };
}

function provenance(bend, clang) {
  const tools = { bend: tool(bend, ["version"]), clang: tool(clang, ["--version"]) };
  return {
    tools,
    host: host(),
    flags: { cEmissionTimeoutMs: NATIVE_C_EMISSION_TIMEOUT_MS, bend: ["-o"], clang: [...CLANG_FLAGS], libraries: [...CLANG_LIBRARIES] },
    // The installed native Bend executable resolves Base beside its bin directory.
    base: realpathSync(join(dirname(dirname(tools.bend.path)), "bend2", "base.bend")),
  };
}

function fixturePath(fixture) {
  if (!(fixture instanceof URL) || fixture.protocol !== "file:") return fail("fixture must be a local file URL");
  const path = realpathSync(fileURLToPath(fixture));
  if (!path.endsWith(".bend") || !lstatSync(path).isFile()) return fail("fixture must be a Bend file");
  return path;
}

function sourceGraph(root, base) {
  const files = new Map();
  const visit = path => {
    const actual = realpathSync(path);
    if (files.has(actual)) return;
    const bytes = readFileSync(actual);
    files.set(actual, hash(bytes));
    if (/\.(?:c|h)$/.test(actual)) {
      for (const match of bytes.toString("utf8").matchAll(/^\s*#\s*include\s*"([^"\n]+)"/gm)) visit(resolve(dirname(actual), match[1]));
    }
    if (!actual.endsWith(".bend")) return;
    for (const match of bytes.toString("utf8").matchAll(/^\s*import\s+("[^"\n]+"|'[^'\n]+'|[^\s#]+)(?:\s|$)/gm)) {
      const name = match[1].replace(/^["']|["']$/g, "");
      if (name === "Base") visit(base);
      else if ((name.startsWith(".") || isAbsolute(name)) && /\.(bend|c|js)$/.test(name)) visit(resolve(dirname(actual), name));
      else fail(`unresolved import in source graph: ${name}`);
    }
  };
  visit(root);
  // Base declares foreign effects before compiler reachability is observable.
  // Hash their complete declared C/JS asset set conservatively, including Base.
  visit(base);
  const entries = [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, sha256]) => ({ path, sha256 }));
  return { entries, sha256: hash(JSON.stringify(entries)) };
}

function keys(value, expected) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !same(Object.keys(value).sort(), [...expected].sort())) fail("invalid manifest shape");
}

function artifact(directory, name, expectedHash, executableRequired = false) {
  if (typeof name !== "string" || name !== basename(name) || !/^fixture-\d+(?:\.c)?$/.test(name)) return fail("artifact escaped session directory");
  const path = join(directory, name);
  if (!lstatSync(path).isFile() || dirname(realpathSync(path)) !== directory) return fail("artifact escaped session directory");
  if (fileHash(path) !== expectedHash) return fail("artifact digest mismatch");
  if (executableRequired) accessSync(path, constants.X_OK);
  return path;
}

/** Fresh serial compilation only. No previously generated artifact is read. */
export function createNativePreflight({ fixtures, bend = "bend", clang = "clang" }) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) return fail("at least one selected fixture is required");
  const roots = fixtures.map(fixturePath);
  if (new Set(roots).size !== roots.length) return fail("duplicate selected fixture");
  const inputs = provenance(bend, clang);
  const sessionId = randomUUID();
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "hapsland-native-preflight-")));
  try {
    const entries = roots.map((root, index) => {
      const graph = sourceGraph(root, inputs.base);
      const cName = `fixture-${index}.c`;
      const binaryName = `fixture-${index}`;
      const c = join(directory, cName);
      const binary = join(directory, binaryName);
      checked(inputs.tools.bend.path, [root, "-o", c], NATIVE_C_EMISSION_TIMEOUT_MS);
      checked(inputs.tools.clang.path, [...CLANG_FLAGS, c, "-o", binary, ...CLANG_LIBRARIES], 15000);
      if (!same(graph, sourceGraph(root, inputs.base))) fail("source changed during compilation");
      const cHash = fileHash(c);
      const binaryHash = fileHash(binary);
      artifact(directory, cName, cHash);
      artifact(directory, binaryName, binaryHash, true);
      return { root, graph, c: { name: cName, sha256: cHash }, binary: { name: binaryName, sha256: binaryHash } };
    });
    if (!same(inputs, provenance(bend, clang))) fail("tool provenance changed during compilation");
    const manifest = { version: 1, sessionId, ownerPid: process.pid, directory, ...inputs, entries };
    const manifestPath = join(directory, "manifest.json");
    const bytes = JSON.stringify(manifest);
    writeFileSync(manifestPath, bytes, { flag: "wx", mode: 0o600 });
    const handle = Object.freeze({ manifestPath, sessionId, manifestHash: hash(bytes) });
    created.add(handle);
    return handle;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

/** Reject every missing/stale/mismatched supplied session; never compile a fallback. */
export function validateNativeFixture({ manifestPath, sessionId, manifestHash, fixture, bend = "bend", clang = "clang" }) {
  if (typeof manifestPath !== "string" || typeof sessionId !== "string" || typeof manifestHash !== "string") return fail("missing session pins");
  const directory = realpathSync(dirname(manifestPath));
  if (basename(manifestPath) !== "manifest.json" || !basename(directory).startsWith("hapsland-native-preflight-")
    || !lstatSync(manifestPath).isFile() || realpathSync(manifestPath) !== join(directory, "manifest.json")) return fail("invalid session manifest path");
  const bytes = readFileSync(manifestPath);
  if (hash(bytes) !== manifestHash) return fail("manifest digest mismatch");
  const manifest = JSON.parse(bytes.toString("utf8"));
  keys(manifest, ["version", "sessionId", "ownerPid", "directory", "tools", "host", "flags", "base", "entries"]);
  if (manifest.version !== 1 || manifest.sessionId !== sessionId || manifest.directory !== directory
    || !Number.isSafeInteger(manifest.ownerPid) || manifest.ownerPid < 1 || !Array.isArray(manifest.entries)) return fail("invalid session identity");
  try { process.kill(manifest.ownerPid, 0); } catch { return fail("session owner is no longer running"); }
  const inputs = provenance(bend, clang);
  if (!same({ tools: manifest.tools, host: manifest.host, flags: manifest.flags, base: manifest.base }, inputs)) return fail("tool/host/flags provenance mismatch");
  const root = fixturePath(fixture);
  const matching = manifest.entries.filter(entry => entry?.root === root);
  if (matching.length !== 1) return fail("fixture was not selected in this session");
  const entry = matching[0];
  keys(entry, ["root", "graph", "c", "binary"]);
  keys(entry.c, ["name", "sha256"]);
  keys(entry.binary, ["name", "sha256"]);
  if (!same(entry.graph, sourceGraph(root, inputs.base))) return fail("source graph mismatch");
  artifact(directory, entry.c.name, entry.c.sha256);
  return { binaryPath: artifact(directory, entry.binary.name, entry.binary.sha256, true) };
}

/** Only the handle returned by this process can delete its own session. */
export function cleanupNativePreflight(handle) {
  if (!created.has(handle)) return fail("cleanup requires an owned session handle");
  if (closed.has(handle)) return;
  rmSync(dirname(handle.manifestPath), { recursive: true, force: true });
  closed.add(handle);
}
