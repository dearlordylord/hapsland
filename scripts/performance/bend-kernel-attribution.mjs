// Diagnostic only: preserve the full kernel and book; never a proof acceptance gate.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const [sourcePath, expectedSourceHash, bookPath, expectedBookHash, toolchainPath] = process.argv.slice(2)
assert.equal(process.argv.length, 7, "expected kernel source/hash, complete book/hash, Lean toolchain directory")
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
const source = readFileSync(sourcePath, "utf8")
const book = readFileSync(bookPath)
assert.equal(hash(source), expectedSourceHash, "kernel source identity")
assert.equal(hash(book), expectedBookHash, "complete book identity")
const marker = "def main (args : List String) : IO UInt32 := do"
assert.equal(source.split(marker).length, 2, "exactly one original kernel main")
// Replicate only the existing checker equations; every unexpanded node delegates
// to the original checker. The original Def.check is replayed after observation.
const inferStart = source.indexOf("def Term.infer (ck : Book)")
const checkStart = source.indexOf("def Term.check (ck : Book)")
const inferEnd = source.indexOf("\n-- Γ ⊢ v", inferStart)
const checkEnd = source.indexOf("\nend", checkStart)
assert.ok(inferStart >= 0 && inferEnd > inferStart && checkEnd > checkStart)
const replica = (body, name, result) =>
  body
    .replace(
      `def Term.${name} (ck : Book)`,
      `partial def observe${name}Core (counter : IO.Ref Nat) (depth : Nat) (path : String) (ck : Book)`
    )
    .replace(`Res ${result}`, `ExceptT String IO ${result}`)
    .replaceAll("Min a b", "Term.Min a b")
    .replaceAll("Term.check ck", 'observeCheck counter depth (path ++ "/check") ck')
    .replaceAll("Term.infer ck", 'observeInfer counter depth (path ++ "/infer") ck')
const subtreeObserver = String.raw`
instance : MonadLift (Except String) (ExceptT String IO) where
  monadLift result := ExceptT.mk (pure result)

def diagnosticHead (term : Term) : String :=
  match (Term.unspine term []).1 with
  | Ref name => name
  | Lam _ _ => "Lam"
  | Let _ _ _ => "Let"
  | Prj _ => "Prj"
  | Mat name _ _ => "Mat:" ++ name
  | Rwt _ _ _ => "Rwt"
  | Ann _ _ => "Ann"
  | _ => "other"

def observeNode {A : Type} (counter : IO.Ref Nat) (depth : Nat) (path : String)
    (term : Term) (fallback : Unit → Res A) (action : ExceptT String IO A) : ExceptT String IO A := ExceptT.mk do
  let used ← counter.get
  if depth == 0 || used >= 128 then
    pure (fallback ())
  else
    match term with
    | Lam _ _ => action.run
    | _ =>
      counter.set (used + 1)
      let started ← IO.monoNanosNow
      let result ← action.run
      let ended ← IO.monoNanosNow
      (← IO.getStderr).putStrLn s!"kernel-subtree\t{used}\t{path}\t{diagnosticHead term}\t{ended - started}"
      pure result

mutual
partial def observeCheck (counter : IO.Ref Nat) (depth : Nat) (path : String)
    (ck : Book) (fuel : Nat) (ctx : Ctx) (term expected : Term) : ExceptT String IO Unit :=
  observeNode counter depth path term (fun _ => Term.check ck fuel ctx term expected)
    (observecheckCore counter (match term with | Lam _ _ => depth | _ => depth - 1) path ck fuel ctx term expected)

partial def observeInfer (counter : IO.Ref Nat) (depth : Nat) (path : String)
    (ck : Book) (fuel : Nat) (ctx : Ctx) (term : Term) : ExceptT String IO Term :=
  observeNode counter depth path term (fun _ => Term.infer ck fuel ctx term)
    (observeinferCore counter (depth - 1) path ck fuel ctx term)

${replica(source.slice(inferStart, inferEnd), "infer", "Term")}
${replica(source.slice(checkStart, checkEnd), "check", "Unit")}
end
`

const instrumentation = `
-- Diagnostic IO only; Def.check and the original main remain unchanged.
${subtreeObserver}
def diagnosticStage (name : String) (check : Unit → Res Unit) : IO (Res Unit) := do
  let started ← IO.monoNanosNow
  match check () with
  | .error e =>
    let ended ← IO.monoNanosNow
    (← IO.getStderr).putStrLn s!"kernel-target-stage\\t{name}\\t{ended - started}"
    pure (.error e)
  | .ok _ =>
    let ended ← IO.monoNanosNow
    (← IO.getStderr).putStrLn s!"kernel-target-stage\\t{name}\\t{ended - started}"
    pure (.ok ())

def diagnosticTarget (bk : Book) (ls : Book × Book) (i : Nat) (d : Def) : IO (Res Unit) := do
  let ck := if d.o then ls.2 else ls.1
  let counter ← IO.mkRef 0
  let observed : ExceptT String IO Unit := do
    ExceptT.mk (diagnosticStage "freshness" (fun _ => Res.need (Book.index bk d.k == some i) "a fresh name"))
    ExceptT.mk (diagnosticStage "type" (fun _ => Term.check ck FUEL [] d.T T1))
    observeCheck counter 12 "body" ck FUEL [] d.v d.T
    ExceptT.mk (diagnosticStage "closure" (fun _ => Res.need (Term.ren Nat.succ d.v == d.v) "a closed def"))
    ExceptT.mk (diagnosticStage "termination" (fun _ => Res.need (Term.tree ⟨bk, i, [], [], []⟩ [] d.v) "affine live code, calls that descend"))
  let result ← observed.run
  let original := Def.check bk ls i d
  match result, original with
  | .ok _, .ok _ => pure original
  | .error left, .error right =>
    if left == right then pure original else throw (IO.userError "target error mismatch")
  | _, _ => throw (IO.userError "target verdict mismatch")

def diagnosticChecks (bk : Book) (ls : Book × Book) : Nat → List Def → IO (Res Unit)
  | _, [] => pure (.ok ())
  | i, d :: ds => do
    let started ← IO.monoNanosNow
    let checked ← if d.k == "ready_encoded_decision" then diagnosticTarget bk ls i d
      else pure (Def.check bk ls i d)
    match checked.mapError (fun e => "In " ++ d.k ++ ":\\n" ++ e) with
    | .error e =>
      let ended ← IO.monoNanosNow
      (← IO.getStderr).putStrLn s!"kernel-definition\\t{i}\\t{ended - started}\\t{d.k}"
      pure (.error e)
    | .ok _ =>
      let ended ← IO.monoNanosNow
      (← IO.getStderr).putStrLn s!"kernel-definition\\t{i}\\t{ended - started}\\t{d.k}"
      diagnosticChecks bk ls (i + 1) ds

def diagnosticMain (path : String) : IO UInt32 := do
  let text ← IO.FS.readFile path
  let started ← IO.monoNanosNow
  let result ← match Book.parse text with
    | .error e => do
      let ended ← IO.monoNanosNow
      (← IO.getStderr).putStrLn s!"kernel-parse\\t{ended - started}"
      pure (.error e)
    | .ok bk => do
      let ended ← IO.monoNanosNow
      (← IO.getStderr).putStrLn s!"kernel-parse\\t{ended - started}"
      diagnosticChecks bk (bk, Book.of (bk.defs.map ({ · with o := false }))) 0 bk.defs
  match result with
  | .ok _ => IO.println "ALL PROOFS CHECK"; pure 0
  | .error e => IO.println ("SOME PROOFS FAIL\\n" ++ e); pure 1

def main (args : List String) : IO UInt32 := do
  match args with
  | ["--baseline", path] => originalMain [path]
  | [path] => diagnosticMain path
  | _ => IO.println "usage: diagnostic-kernel [--baseline] <complete.bendtt>"; pure 2
`
const generated = source.replace(marker, "def originalMain (args : List String) : IO UInt32 := do") + instrumentation
const temporary = mkdtempSync(join(tmpdir(), "hapsland-kernel-attribution-"))
const run = (program, args, milliseconds, input) => {
  const result = spawnSync(
    "timeout",
    ["-s", "KILL", `${milliseconds / 1000}s`, "taskset", "-c", "10", program, ...args],
    {
      cwd: temporary,
      input,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, LEAN_STACK_SIZE_KB: "4194304" }
    }
  )
  if (result.error) throw result.error
  return result
}
try {
  const deadline = performance.now() + 90000
  const remaining = () => {
    const value = Math.floor(deadline - performance.now())
    assert.ok(value > 0, "90-second total checker build deadline")
    return value
  }
  const lean = join(resolve(toolchainPath), "bin/lean")
  const version = run(lean, ["--version"], Math.min(10000, remaining()))
  assert.equal(version.status, 0, version.stderr)
  assert.match(version.stdout, /^Lean \(version 4\.34\.1,/u)
  const c = join(temporary, "kernel.c")
  const binary = join(temporary, "kernel")
  const compiled = run(lean, ["--stdin", "-c", c], remaining(), generated)
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr)
  const linked = run(join(resolve(toolchainPath), "bin/leanc"), ["-O3", "-DNDEBUG", c, "-o", binary], remaining())
  assert.equal(linked.status, 0, linked.stdout + linked.stderr)
  console.error(
    JSON.stringify({ diagnosticOnly: true, sourceHash: hash(source), bookHash: hash(book), bookBytes: book.length })
  )
  const baselineStart = performance.now()
  const baseline = run(binary, ["--baseline", resolve(bookPath)], 10000)
  console.error(
    JSON.stringify({
      stage: "baseline",
      exit: baseline.status,
      signal: baseline.signal,
      milliseconds: performance.now() - baselineStart
    })
  )
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr)
  assert.equal(baseline.stdout.trim(), "ALL PROOFS CHECK")
  const start = performance.now()
  const attributed = run(binary, [resolve(bookPath)], 10000)
  process.stderr.write(attributed.stderr)
  process.stdout.write(attributed.stdout)
  console.error(
    JSON.stringify({
      stage: "attributed",
      exit: attributed.status,
      signal: attributed.signal,
      milliseconds: performance.now() - start
    })
  )
  if (attributed.status === 0) assert.equal(attributed.stdout, baseline.stdout, "same full-book verdict")
  assert.equal(hash(readFileSync(sourcePath)), expectedSourceHash, "kernel source unchanged")
  assert.equal(hash(readFileSync(bookPath)), expectedBookHash, "book unchanged")
  process.exitCode = attributed.status ?? 1
} finally {
  // Generated compiler artifacts have no lifecycle after this diagnostic invocation.
  rmSync(temporary, { recursive: true, force: true })
}
