import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import { createHash } from "node:crypto"
import { pureReply } from "./frontend-codec.ts"
import { parseGoFileFacts } from "./go-module/parser-facts.ts"
import type {
  CaptureDiagnostic,
  Request,
  Reply,
  ResourceValues,
  ServiceOutcome,
  ServiceSession,
  SessionPorts,
  Token,
  TokenKind,
  Variant,
  PerformOptions,
  Maybe
} from "./service-contract.ts"
import {
  hostNatural,
  list,
  unlist,
  binary64,
  productValue,
  fromProductValue
} from "@hapsland/source-artifacts/direct-event/value/codec"
import * as path from "node:path"
import { lstat, opendir } from "node:fs/promises"

const required = <Value>(value: Value | undefined): Value => {
  if (value === undefined) throw new TypeError("Missing service port")
  return value
}
const tag = <Name extends string>(name: Name) => `Types.${name}` as const
function tagged<Name extends string>(name: Name): Variant<Name>
function tagged<Name extends string, Fields extends object>(name: Name, fields: Fields): Variant<Name, Fields>
function tagged(name: string, fields?: object) {
  return { $: tag(name), ...fields }
}

// Independent service/session state only: native resources and caller-owned IO.
// No graph queues, budgets, dependency choices or result-tree construction.
function fromDiagnostic(value: CaptureDiagnostic) {
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
  openDirectory = opendir,
  now = () => performance.now(),
  callerCache,
  access,
  capture,
  frontend,
  parseCargo,
  inspectRustModules,
  selectContextPath,
  parsePythonSyntax,
  readGoConfiguration,
  readAnalysisConfigurationIdentity,
  diagnostic
}: SessionPorts): ServiceSession {
  if (!Number.isSafeInteger(invocation) || invocation < 0) throw new Error("invalid invocation")
  const resources: { [Kind in TokenKind]: Map<number, ResourceValues[Kind]> } = {
    ClockToken: new Map(),
    CaptureToken: new Map(),
    SelectionToken: new Map(),
    ExceptionToken: new Map(),
    CacheToken: new Map()
  }
  let next = 1,
    closed = false,
    accepting = true
  const register = <Kind extends TokenKind>(kind: Kind, value: ResourceValues[Kind]): Token<Kind> => {
    if (closed || !accepting) throw new Error("closed service session")
    const id = next++
    resources[kind].set(id, value)
    return tagged(kind, { invocation, id })
  }
  const lookup = <Kind extends TokenKind>(kind: Kind, token: Token<Kind>): ResourceValues[Kind] => {
    if (
      token?.$ !== tag(kind) ||
      hostNatural(token.invocation) !== invocation ||
      !resources[kind].has(hostNatural(token.id))
    )
      throw new Error("invalid " + kind)
    return resources[kind].get(hostNatural(token.id)) as ResourceValues[Kind]
  }
  const caller: Maybe<Token<"CacheToken">> =
    callerCache === undefined ? { $: "None" } : { $: "Some", value: register("CacheToken", callerCache) }
  const capturedResult = (value: ResourceValues["CaptureToken"]) =>
    tagged("CachePresent", { capture: register("CaptureToken", value), bytes: value.byteLength })
  async function perform(request: Request, { signal }: PerformOptions = {}): Promise<Reply> {
    if (closed || !accepting || request?.$ !== tag("Request") || hostNatural(request.invocation) !== invocation)
      throw new Error("invalid request owner")
    const id = hostNatural(request.id),
      op = request.operation
    let outcome: ServiceOutcome
    try {
      switch (op?.$) {
        case tag("CreateRangeError"):
          throw new RangeError(op.message)
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
        case tag("ReadDirectoryEntries"): {
          const limit = hostNatural(op.limit)
          const entries: string[] = []
          let complete = true
          try {
            const directory = await openDirectory(path.join(root, op.path))
            // Keep raw iterator order and names. The Bend owner chooses its
            // inventory bound, candidate filtering and sort. Early break awaits
            // the iterator's cleanup; filesystem read/close failures discard all.
            for await (const entry of directory) {
              entries.push(entry.name)
              if (entries.length > limit) {
                complete = false
                break
              }
            }
            outcome = tagged("DirectoryEntriesObserved", { entries: list(entries), complete })
          } catch (error) {
            if (signal?.aborted) throw error
            outcome = tagged("DirectoryEntriesUnavailable")
          }
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
            membership = tagged(
              error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT"
                ? "MembershipAbsent"
                : "MembershipFailed"
            )
          }
          outcome = tagged("MembershipResult", { membership })
          break
        }
        case tag("SelectContextPath"):
          outcome = tagged("ContextSelectionResult", { selected: await required(selectContextPath)(op.path) })
          break
        case tag("ParsePythonSyntax"): {
          const source = lookup("CaptureToken", op.capture)
          outcome = tagged("PythonSyntaxResult", { syntax: await required(parsePythonSyntax)(source.text) })
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
          const selected = await required(access)(op.path, { signal })
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
          const result = await required(capture)(lookup("SelectionToken", op.selection), hostNatural(op.source_cap), {
            signal
          })
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
          const facts = await required(frontend)(op.path, source.text, op.context, { signal })
          outcome = tagged("FrontendResult", {
            outcome: facts === undefined ? tagged("SourceUnsupported") : tagged("SourceInspected", { facts })
          })
          break
        }
        case tag("ReadCapturedText"): {
          const captured = lookup("CaptureToken", op.capture)
          outcome = tagged("CapturedText", { text: captured.text, content_hash: captured.contentHash })
          break
        }
        case tag("ReadGoConfiguration"): {
          const value = readGoConfiguration?.()
          outcome = tagged("GoConfigurationRead", {
            configuration:
              value === undefined
                ? { $: "None" }
                : {
                    $: "Some",
                    value: {
                      $: "go-module/Configuration.Configuration",
                      goos: value.goos,
                      goarch: value.goarch,
                      tags: list(
                        value.tags.map((text) => ({
                          $: "go-module/RawText.Text" as const,
                          value: text,
                          characters: list(
                            Array.from(text, (character) => ({
                              $: "go-module/RawText.Character" as const,
                              code: character.codePointAt(0)!,
                              whitespace: /^\s$/u.test(character)
                            }))
                          )
                        }))
                      )
                    }
                  }
          })
          break
        }
        case tag("ReadAnalysisConfigurationIdentity"): {
          const value = readAnalysisConfigurationIdentity?.()
          outcome = tagged("AnalysisConfigurationIdentityRead", {
            identity: value === undefined ? { $: "None" } : { $: "Some", value }
          })
          break
        }
        case tag("ReadGoBuildText"):
          outcome = tagged("GoBuildTextResult", {
            source: {
              $: "go-module/RawText.Text" as const,
              value: op.text,
              characters: list(
                Array.from(op.text, (text) => ({
                  $: "go-module/RawText.Character" as const,
                  code: text.codePointAt(0)!,
                  whitespace: /^\s$/u.test(text)
                }))
              )
            }
          })
          break
        case tag("ReadGoCharacters"):
          outcome = tagged("GoCharactersResult", {
            characters: list(
              Array.from(op.text, (text) => ({
                $: "go-module/Input.Character" as const,
                text,
                letter: /^\p{L}$/u.test(text),
                number: /^\p{N}$/u.test(text),
                uppercase: /^\p{Lu}$/u.test(text)
              }))
            )
          })
          break
        case tag("HashJsonProduct"):
          outcome = tagged("JsonProductHashed", {
            hash: createHash("sha256")
              .update(JSON.stringify(fromProductValue(op.value)), "utf8")
              .digest("hex")
          })
          break
        case tag("InspectGoFile"): {
          const captured = lookup("CaptureToken", op.capture)
          const file = parseGoFileFacts(op.path, captured.text)
          outcome = tagged("GoFileResult", {
            outcome: file === undefined ? tagged("GoFileUnsupported") : tagged("GoFileInspected", { file })
          })
          break
        }
        case tag("ParseCargo"): {
          const source = lookup("CaptureToken", op.capture)
          const syntax = await required(parseCargo)(source.text)
          outcome = tagged("CargoResult", {
            outcome: syntax === undefined ? tagged("CargoUnsupported") : tagged("CargoInspected", { syntax })
          })
          break
        }
        case tag("InspectRustModules"): {
          const source = lookup("CaptureToken", op.capture)
          const facts = await required(inspectRustModules)(source.text)
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
  const session: ServiceSession = Object.freeze({
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
  return session
}

export function createServiceRegistry() {
  const registry = createNativeSessionRegistry<ServiceSession>()
  return Object.freeze({
    ...registry,
    get size() {
      return registry.size
    },
    get pendingCleanup() {
      return registry.pendingCleanup
    },
    async perform(request: Request, options?: PerformOptions): Promise<ReturnType<typeof pureReply<Reply>>> {
      const session = registry.get(hostNatural(request.invocation))
      if (!session) throw new TypeError("Unknown graph service invocation")
      return pureReply(await session.perform(request, options))
    }
  })
}
