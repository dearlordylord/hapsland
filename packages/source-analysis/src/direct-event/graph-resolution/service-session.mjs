import {
  artifactValueTag,
  hostNatural,
  list,
  unlist,
  binary64,
  productValue,
  fromProductValue
} from "@hapsland/source-artifacts/direct-event/value/codec"
import * as path from "node:path"
import { lstat } from "node:fs/promises"

const tag = (name) => artifactValueTag(name) ?? "Types." + name
const tagged = (name, fields = {}) => ({ $: tag(name), ...fields })

// Independent service/session state only: native resources and caller-owned IO.
// No graph queues, budgets, dependency choices or result-tree construction.
function fromDiagnostic(value) {
  if (value?.$ === tag("CaptureDiagnostic")) return fromProductValue(value.value)
  if (value?.$ === tag("CaptureBudgetDiagnostic"))
    return {
      stage: "capture",
      code: "capture-budget-limit",
      args: {
        resource: value.resource,
        used: hostNatural(value.used),
        requested: hostNatural(value.requested),
        limit: hostNatural(value.limit)
      }
    }
  throw new Error("invalid capture diagnostic")
}
export function createServiceSession({
  invocation,
  root,
  now = () => performance.now(),
  callerCache,
  access,
  capture,
  frontend,
  parseCargo,
  inspectRustModules,
  selectContextPath,
  parsePythonSyntax,
  diagnostic
} = {}) {
  if (!Number.isSafeInteger(invocation) || invocation < 0) throw new Error("invalid invocation")
  const resources = {
    ClockToken: new Map(),
    CaptureToken: new Map(),
    SelectionToken: new Map(),
    ExceptionToken: new Map(),
    CacheToken: new Map()
  }
  let next = 1,
    closed = false,
    accepting = true
  const register = (kind, value) => {
    if (closed || !accepting) throw new Error("closed service session")
    const id = next++
    resources[kind].set(id, value)
    return tagged(kind, { invocation, id })
  }
  const lookup = (kind, token) => {
    if (
      token?.$ !== tag(kind) ||
      hostNatural(token.invocation) !== invocation ||
      !resources[kind].has(hostNatural(token.id))
    )
      throw new Error("invalid " + kind)
    return resources[kind].get(hostNatural(token.id))
  }
  const caller = callerCache === undefined ? { $: "None" } : { $: "Some", value: register("CacheToken", callerCache) }
  const capturedResult = (value) =>
    tagged("CachePresent", { capture: register("CaptureToken", value), bytes: value.byteLength })
  async function perform(request, { signal } = {}) {
    if (closed || !accepting || request?.$ !== tag("Request") || hostNatural(request.invocation) !== invocation)
      throw new Error("invalid request owner")
    const id = hostNatural(request.id),
      op = request.operation
    let outcome
    try {
      switch (op?.$) {
        case tag("StartClock"):
          outcome = tagged("ClockStarted", { clock: register("ClockToken", now()) })
          break
        case tag("ReadClock"):
          outcome = tagged("ClockRead", { bits: binary64(now() - lookup("ClockToken", op.clock)) })
          break
        case tag("PathDirname"):
          outcome = tagged("DirnameResult", { path: path.dirname(op.path) })
          break
        case tag("PathBasename"):
          outcome = tagged("BasenameResult", {
            name: path.basename(op.path, op.suffix.$ === "Some" ? op.suffix.value : undefined)
          })
          break
        case tag("ReadPathSeparator"):
          outcome = tagged("PathSeparatorResult", { separator: path.sep })
          break
        case tag("PathJoin"):
          outcome = tagged("JoinedResult", { path: path.join(...unlist(op.parts)) })
          break
        case tag("PathNormalize"):
          outcome = tagged("NormalizedResult", { path: path.normalize(op.path) })
          break
        case tag("PathRelative"):
          outcome = tagged("RelativeResult", { path: path.relative(op.from, op.to) })
          break
        case tag("PathExtension"):
          outcome = tagged("ExtensionResult", { extension: path.extname(op.path) })
          break
        case tag("PathIsAbsolute"):
          outcome = tagged("AbsoluteResult", { absolute: path.isAbsolute(op.path) })
          break
        case tag("JoinedPathFacts"): {
          const normalized = path.normalize(path.join(path.dirname(op.from), op.leaf))
          outcome = tagged("JoinedPathFactsResult", {
            separator: path.sep,
            normalized,
            absolute: path.isAbsolute(normalized),
            extension: path.extname(normalized),
            leaf_extension: path.extname(op.leaf)
          })
          break
        }
        case tag("ReadFileStatus"): {
          const status = await lstat(path.join(root, op.path)).catch(() => undefined)
          outcome = tagged("StatusResult", {
            status: tagged(status === undefined ? "FileAbsent" : status.isFile() ? "ExistingFile" : "ExistingOther")
          })
          break
        }
        case tag("ReadPathMembership"): {
          let membership
          try {
            const status = await lstat(path.join(root, op.path))
            membership = tagged("MembershipPresent", {
              is_file: status.isFile(),
              is_directory: status.isDirectory(),
              is_symlink: status.isSymbolicLink(),
              signature: [status.mode, status.dev, status.ino, status.size, status.mtimeMs, status.ctimeMs].join(":")
            })
          } catch (error) {
            membership = tagged(error?.code === "ENOENT" ? "MembershipAbsent" : "MembershipFailed")
          }
          outcome = tagged("MembershipResult", { membership })
          break
        }
        case tag("SelectContextPath"):
          outcome = tagged("ContextSelectionResult", { selected: await selectContextPath(op.path) })
          break
        case tag("ParsePythonSyntax"): {
          const source = lookup("CaptureToken", op.capture)
          outcome = tagged("PythonSyntaxResult", { syntax: await parsePythonSyntax(source.text) })
          break
        }
        case tag("ReadIdentifierCharacters"):
          outcome = tagged("IdentifierCharactersResult", {
            characters: list(
              Array.from(op.text, (text) =>
                tagged("IdentifierCharacter", {
                  text,
                  id_start: /^\p{ID_Start}$/u.test(text),
                  id_continue: /^\p{ID_Continue}$/u.test(text)
                })
              )
            )
          })
          break
        case tag("CreateInvocationCache"):
          outcome = tagged("InvocationCacheCreated", { cache: register("CacheToken", new Map()) })
          break
        case tag("LookupCaptureCache"): {
          const cache = lookup("CacheToken", op.cache),
            value = cache.get(op.path)
          outcome = tagged("CacheResult", {
            outcome: value === undefined ? tagged("CacheAbsent") : capturedResult(value)
          })
          break
        }
        case tag("SnapshotCaptureCache"): {
          const cache = lookup("CacheToken", op.cache)
          outcome = tagged("CacheSnapshot", {
            entries: list([...cache].map(([p, c]) => tagged("CaptureBytes", { path: p, bytes: c.byteLength })))
          })
          break
        }
        case tag("StoreCaptureCache"):
        case tag("InsertRootCaptureCache"): {
          lookup("CacheToken", op.cache).set(op.path, lookup("CaptureToken", op.capture))
          outcome = tagged(op.$ === tag("StoreCaptureCache") ? "CacheStored" : "RootCacheInserted")
          break
        }
        case tag("AccessPath"): {
          const selected = await access(op.path, { signal })
          outcome = tagged("AccessResult", {
            outcome:
              selected === undefined
                ? tagged("AccessDenied")
                : tagged("AccessAllowed", {
                    selection: register("SelectionToken", selected),
                    relative_path: selected.relativePath
                  })
          })
          break
        }
        case tag("CaptureSource"): {
          const result = await capture(lookup("SelectionToken", op.selection), hostNatural(op.source_cap), { signal })
          outcome = tagged("CaptureResult", {
            outcome:
              result.status === "unavailable"
                ? tagged("CaptureUnavailable", {
                    diagnostic: tagged("CaptureDiagnostic", { value: productValue(result.diagnostic) })
                  })
                : tagged("SourceCaptured", {
                    capture: register("CaptureToken", result.capture),
                    relative_path: lookup("SelectionToken", op.selection).relativePath,
                    bytes: result.capture.byteLength
                  })
          })
          break
        }
        case tag("InspectSource"): {
          const source = lookup("CaptureToken", op.capture)
          const facts = await frontend(op.path, source.text, op.context, { signal })
          outcome = tagged("FrontendResult", {
            outcome: facts === undefined ? tagged("SourceUnsupported") : tagged("SourceInspected", { facts })
          })
          break
        }
        case tag("ParseCargo"): {
          const source = lookup("CaptureToken", op.capture)
          const syntax = await parseCargo(source.text)
          outcome = tagged("CargoResult", {
            outcome: syntax === undefined ? tagged("CargoUnsupported") : tagged("CargoInspected", { syntax })
          })
          break
        }
        case tag("InspectRustModules"): {
          const source = lookup("CaptureToken", op.capture)
          const facts = await inspectRustModules(source.text)
          outcome = tagged("RustModulesResult", {
            outcome:
              facts === undefined
                ? tagged("RustModulesUnsupported")
                : tagged("RustModulesInspected", { names: list(facts.names) })
          })
          break
        }
        case tag("ObserveDiagnostic"):
          try {
            diagnostic?.(op.path, fromDiagnostic(op.diagnostic))
          } catch {}
          outcome = tagged("DiagnosticObserved")
          break
        case tag("EncodeProduct"):
          outcome = tagged("ProductEncoded", {
            bytes: Buffer.byteLength(JSON.stringify(fromProductValue(op.value)), "utf8")
          })
          break
        case tag("EncodeSourceText"):
          outcome = tagged("SourceTextEncoded", { bytes: Buffer.byteLength(op.text, "utf8") })
          break
        default:
          throw new Error("unknown service operation")
      }
    } catch (error) {
      if (closed || !accepting) throw error
      outcome = tagged("ProviderRejected", { exception: register("ExceptionToken", error) })
    }
    return tagged("Reply", { invocation, id, outcome })
  }
  return Object.freeze({
    invocation,
    callerCache: caller,
    perform,
    registerCapture: (value) => register("CaptureToken", value),
    exception: (token) => lookup("ExceptionToken", token),
    cacheSnapshot: (token) => [...lookup("CacheToken", token)],
    revoke() {
      accepting = false
    },
    close() {
      closed = true
      accepting = false
      for (const table of Object.values(resources)) table.clear()
    }
  })
}

export function createServiceRegistry() {
  const sessions = new Map(),
    cleanupObligations = new Map()
  const retainCleanup = (session, retry) => {
    const previous = cleanupObligations.get(session.invocation)
    if (previous && previous.session !== session) throw new Error("Cleanup obligation owner replaced")
    cleanupObligations.set(session.invocation, { session, retry })
  }
  const retryCleanup = async () => {
    const failures = []
    for (const [id, obligation] of [...cleanupObligations]) {
      try {
        await obligation.retry()
        if (cleanupObligations.get(id) === obligation) cleanupObligations.delete(id)
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length) throw new AggregateError(failures, "Resident cleanup obligations remain pending")
  }
  const register = (session) => {
    if (sessions.has(session.invocation)) throw new Error("duplicate active invocation")
    sessions.set(session.invocation, session)
  }
  const remove = (session) => {
    if (sessions.get(session.invocation) !== session) throw new Error("wrong registry owner")
    sessions.delete(session.invocation)
  }
  // Preserve distinct failure events even when their original thrown values are
  // identical. A whole owning workflow can compose task and finalizer causes;
  // ordinary run retains JavaScript finally's last-failure behavior.
  const runOutcome = async (session, task) => {
    const failures = []
    let registered = false,
      taskOutcome = { status: "not-started" },
      rejection
    const record = (phase, error) => {
      const receipt = { phase, error }
      failures.push(receipt)
      rejection = receipt
      return receipt
    }
    try {
      register(session)
      registered = true
    } catch (error) {
      record("register", error)
    }
    if (registered) {
      try {
        taskOutcome = { status: "success", value: await task() }
      } catch (error) {
        taskOutcome = { status: "failure", receipt: record("task", error) }
      }
      try {
        session.close()
      } catch (error) {
        record("close", error)
      }
      try {
        remove(session)
      } catch (error) {
        record("remove", error)
      }
    }
    return { task: taskOutcome, failures, rejection }
  }
  return Object.freeze({
    retainCleanup,
    retryCleanup,
    hasCleanup: (session) => cleanupObligations.get(session.invocation)?.session === session,
    get pendingCleanup() {
      return cleanupObligations.size
    },
    get: (id) => sessions.get(id),
    get size() {
      return sessions.size
    },
    register,
    remove,
    runOutcome,
    async run(session, task) {
      const outcome = await runOutcome(session, task)
      if (outcome.rejection) throw outcome.rejection.error
      return outcome.task.value
    }
  })
}
