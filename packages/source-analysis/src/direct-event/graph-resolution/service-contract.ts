import type * as Effect from "effect/Effect"
import type { NativeWork, NativeFlow } from "@hapsland/runtime-environment/runtime/native-execution"
import type { parseGoFileFacts } from "./go-module/parser-facts.ts"
import type { List, ProductValue, Binary64 } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { CaptureResult, StableCapture } from "@hapsland/native-observation/direct-event/capture"
import type { EligiblePath } from "@hapsland/native-observation/direct-event/selection"
import type {
  inspectSourceFrontend,
  inspectRustModuleSyntax,
  parseCargoSyntax,
  parsePythonSyntax
} from "./frontends.ts"

export type Natural = number | bigint
export type Variant<Name extends string, Fields extends object = Record<never, never>> = {
  readonly $: `Types.${Name}`
} & Fields
export type Maybe<Value> = { readonly $: "None" } | { readonly $: "Some"; readonly value: Value }
export type TokenKind = "ClockToken" | "CaptureToken" | "SelectionToken" | "ExceptionToken" | "CacheToken"
export type Token<Kind extends TokenKind, Nat extends Natural = Natural> = Variant<
  Kind,
  { readonly invocation: Nat; readonly id: Nat }
>
export type ResourceValues = {
  ClockToken: number
  CaptureToken: StableCapture
  SelectionToken: EligiblePath
  ExceptionToken: unknown
  CacheToken: Map<string, StableCapture>
}
export type CaptureDiagnostic =
  | Variant<"CaptureDiagnostic", { readonly value: ProductValue }>
  | Variant<
      "CaptureBudgetDiagnostic",
      { readonly resource: string; readonly used: Natural; readonly requested: Natural; readonly limit: Natural }
    >
export type Operation =
  | Variant<"CreateRangeError", { readonly message: string }>
  | Variant<"InspectGoFile", { readonly path: string; readonly capture: Token<"CaptureToken"> }>
  | Variant<"ReadDirectoryEntries", { readonly path: string; readonly limit: Natural }>
  | Variant<
      | "StartClock"
      | "ReadPathSeparator"
      | "CreateInvocationCache"
      | "ReadGoConfiguration"
      | "ReadAnalysisConfigurationIdentity"
    >
  | Variant<"ReadClock", { readonly clock: Token<"ClockToken"> }>
  | Variant<
      | "PathDirname"
      | "PathNormalize"
      | "PathExtension"
      | "PathIsAbsolute"
      | "ReadFileStatus"
      | "ReadPathMembership"
      | "SelectContextPath"
      | "AccessPath",
      { readonly path: string }
    >
  | Variant<"PathBasename", { readonly path: string; readonly suffix: Maybe<string> }>
  | Variant<"PathJoin", { readonly parts: List<string> }>
  | Variant<"PathRelative", { readonly from: string; readonly to: string }>
  | Variant<"JoinedPathFacts", { readonly from: string; readonly leaf: string }>
  | Variant<
      "ReadCapturedText" | "ParsePythonSyntax" | "ParseCargo" | "InspectRustModules",
      { readonly capture: Token<"CaptureToken"> }
    >
  | Variant<
      "ReadGoBuildText" | "ReadGoCharacters" | "ReadIdentifierCharacters" | "EncodeSourceText",
      { readonly text: string }
    >
  | Variant<"LookupCaptureCache", { readonly cache: Token<"CacheToken">; readonly path: string }>
  | Variant<"SnapshotCaptureCache", { readonly cache: Token<"CacheToken"> }>
  | Variant<
      "StoreCaptureCache" | "InsertRootCaptureCache",
      { readonly cache: Token<"CacheToken">; readonly path: string; readonly capture: Token<"CaptureToken"> }
    >
  | Variant<"CaptureSource", { readonly selection: Token<"SelectionToken">; readonly source_cap: Natural }>
  | Variant<
      "InspectSource",
      {
        readonly path: string
        readonly capture: Token<"CaptureToken">
        readonly context: Parameters<typeof inspectSourceFrontend>[2]
      }
    >
  | Variant<"ObserveDiagnostic", { readonly path: string; readonly diagnostic: CaptureDiagnostic }>
  | Variant<"HashJsonProduct" | "EncodeProduct", { readonly value: ProductValue }>
export type Request = Variant<
  "Request",
  { readonly invocation: Natural; readonly id: Natural; readonly operation: Operation }
>
type CacheOutcome<Nat extends Natural> =
  | Variant<"CacheAbsent">
  | Variant<"CachePresent", { readonly capture: Token<"CaptureToken", Nat>; readonly bytes: Nat }>
export type GoConfiguration = {
  readonly $: "go-module/Configuration.Configuration"
  readonly goos: string
  readonly goarch: string
  readonly tags: List<Extract<ServiceOutcome, Variant<"GoBuildTextResult">>["source"]>
}
export type ServiceOutcome<Nat extends Natural = Natural> =
  | Variant<"GoConfigurationRead", { readonly configuration: Maybe<GoConfiguration> }>
  | Variant<"AnalysisConfigurationIdentityRead", { readonly identity: Maybe<string> }>
  | Variant<
      "GoBuildTextResult",
      {
        readonly source: {
          readonly $: "go-module/RawText.Text"
          readonly value: string
          readonly characters: List<{
            readonly $: "go-module/RawText.Character"
            readonly code: Natural
            readonly whitespace: boolean
          }>
        }
      }
    >
  | Variant<"CapturedText", { readonly text: string; readonly content_hash: string }>
  | Variant<"JsonProductHashed", { readonly hash: string }>
  | Variant<
      "GoCharactersResult",
      {
        readonly characters: List<{
          readonly $: "go-module/Input.Character"
          readonly text: string
          readonly letter: boolean
          readonly number: boolean
          readonly uppercase: boolean
        }>
      }
    >
  | Variant<
      "GoFileResult",
      {
        readonly outcome:
          | Variant<"GoFileUnsupported">
          | Variant<"GoFileInspected", { readonly file: NonNullable<ReturnType<typeof parseGoFileFacts>> }>
      }
    >
  | Variant<"DirectoryEntriesObserved", { readonly entries: List<string>; readonly complete: boolean }>
  | Variant<"DirectoryEntriesUnavailable">
  | Variant<"ClockStarted", { readonly clock: Token<"ClockToken", Nat> }>
  | Variant<"ClockRead", { readonly bits: Binary64 }>
  | Variant<"DirnameResult" | "JoinedResult" | "NormalizedResult" | "RelativeResult", { readonly path: string }>
  | Variant<"BasenameResult", { readonly name: string }>
  | Variant<"PathSeparatorResult", { readonly separator: string }>
  | Variant<"ExtensionResult", { readonly extension: string }>
  | Variant<"AbsoluteResult", { readonly absolute: boolean }>
  | Variant<
      "JoinedPathFactsResult",
      {
        readonly separator: string
        readonly normalized: string
        readonly absolute: boolean
        readonly extension: string
        readonly leaf_extension: string
      }
    >
  | Variant<"StatusResult", { readonly status: Variant<"FileAbsent" | "ExistingFile" | "ExistingOther"> }>
  | Variant<
      "MembershipResult",
      {
        readonly membership:
          | Variant<"MembershipAbsent" | "MembershipFailed">
          | Variant<
              "MembershipPresent",
              {
                readonly is_file: boolean
                readonly is_directory: boolean
                readonly is_symlink: boolean
                readonly signature: string
              }
            >
      }
    >
  | Variant<"ContextSelectionResult", { readonly selected: boolean }>
  | Variant<"PythonSyntaxResult", { readonly syntax: Awaited<ReturnType<typeof parsePythonSyntax>> }>
  | Variant<
      "IdentifierCharactersResult",
      {
        readonly characters: List<
          Variant<
            "IdentifierCharacter",
            { readonly text: string; readonly id_start: boolean; readonly id_continue: boolean }
          >
        >
      }
    >
  | Variant<
      "AccessResult",
      {
        readonly outcome:
          | Variant<"AccessDenied">
          | Variant<
              "AccessAllowed",
              { readonly selection: Token<"SelectionToken", Nat>; readonly relative_path: string }
            >
      }
    >
  | Variant<"InvocationCacheCreated", { readonly cache: Token<"CacheToken", Nat> }>
  | Variant<"CacheResult", { readonly outcome: CacheOutcome<Nat> }>
  | Variant<
      "CacheSnapshot",
      { readonly entries: List<Variant<"CaptureBytes", { readonly path: string; readonly bytes: Nat }>> }
    >
  | Variant<"CacheStored" | "RootCacheInserted" | "DiagnosticObserved">
  | Variant<
      "CaptureResult",
      {
        readonly outcome:
          | Variant<"CaptureUnavailable", { readonly diagnostic: CaptureDiagnostic }>
          | Variant<
              "SourceCaptured",
              { readonly capture: Token<"CaptureToken", Nat>; readonly relative_path: string; readonly bytes: Nat }
            >
      }
    >
  | Variant<
      "FrontendResult",
      {
        readonly outcome:
          | Variant<"SourceUnsupported">
          | Variant<"SourceInspected", { readonly facts: NonNullable<ReturnType<typeof inspectSourceFrontend>> }>
      }
    >
  | Variant<
      "CargoResult",
      {
        readonly outcome:
          | Variant<"CargoUnsupported">
          | Variant<"CargoInspected", { readonly syntax: NonNullable<ReturnType<typeof parseCargoSyntax>> }>
      }
    >
  | Variant<
      "RustModulesResult",
      {
        readonly outcome:
          | Variant<"RustModulesUnsupported">
          | Variant<"RustModulesInspected", { readonly names: List<string> }>
      }
    >
  | Variant<"ProductEncoded" | "SourceTextEncoded", { readonly bytes: Nat }>
  | Variant<"ProviderRejected", { readonly exception: Token<"ExceptionToken", Nat> }>
export type Reply<Nat extends Natural = Natural> = Variant<
  "Reply",
  { readonly invocation: Nat; readonly id: Nat; readonly outcome: ServiceOutcome<Nat> }
>
export type ResolverInput = Variant<
  "ResolverInput",
  {
    readonly invocation: bigint
    readonly root_path: string
    readonly root_capture: Token<"CaptureToken">
    readonly root_bytes: bigint
    readonly root_name: string
    readonly root_source: string
    readonly branch: Variant<"FunctionBranch" | "TypeBranch">
    readonly caller_cache: Maybe<Token<"CacheToken">>
    readonly limits: {
      readonly $: "../../../../agent-flow-bend/ImportGraph.Limits"
      readonly version: bigint
      readonly source_bytes: bigint
      readonly tree_bytes: bigint
      readonly files: bigint
      readonly read_bytes: bigint
      readonly outgoing_edges: bigint
      readonly depth: bigint
      readonly work: bigint
    }
  }
>
export type ResolverFailure =
  | Variant<"WrongInvocation" | "WrongCorrelation", { readonly expected: Natural; readonly actual: Natural }>
  | Variant<"NegativeGraphWork", { readonly magnitude: Natural }>
  | Variant<"ForeignProviderFailure" | "RuntimeFailure", { readonly exception: Token<"ExceptionToken"> }>
  | Variant<
      "WrongReplyKind" | "MalformedReply" | "LocalTraversalFailure" | "InvocationCancelled" | "ReplyAfterTerminal"
    >
export type ResolverOutcome =
  | { readonly failure: ResolverFailure }
  | { readonly result: Variant<"NoReviewUnit"> | Variant<"ReviewUnitResult", { readonly value: ProductValue }> }

export type PerformOptions = { readonly signal?: AbortSignal | undefined }
export type SessionPorts = {
  readonly readGoConfiguration?:
    | (() => { readonly goos: string; readonly goarch: string; readonly tags: readonly string[] } | undefined)
    | undefined
  readonly readAnalysisConfigurationIdentity?: (() => string | undefined) | undefined
  readonly openDirectory?: ((path: string) => Promise<AsyncIterable<{ readonly name: string }>>) | undefined
  readonly invocation: number
  readonly root: string
  readonly now?: (() => number) | undefined
  readonly callerCache?: Map<string, StableCapture> | undefined
  readonly access?: ((path: string, options: PerformOptions) => NativeWork<EligiblePath | undefined>) | undefined
  readonly capture?:
    | ((selection: EligiblePath, cap: number, options: PerformOptions) => NativeWork<CaptureResult>)
    | undefined
  readonly frontend?:
    | ((
        path: string,
        source: string,
        context: Parameters<typeof inspectSourceFrontend>[2],
        options?: PerformOptions
      ) => ReturnType<typeof inspectSourceFrontend> | Promise<ReturnType<typeof inspectSourceFrontend>>)
    | undefined
  readonly parseCargo?: typeof parseCargoSyntax | undefined
  readonly inspectRustModules?: typeof inspectRustModuleSyntax | undefined
  readonly selectContextPath?: ((path: string) => boolean | Promise<boolean>) | undefined
  readonly parsePythonSyntax?: typeof parsePythonSyntax | undefined
  readonly diagnostic?: ((path: string, value: unknown) => unknown) | undefined
}
export type ServiceSession = {
  readonly invocation: number
  readonly callerCache: Maybe<Token<"CacheToken">>
  performFlow(request: Request, options?: PerformOptions): NativeFlow<Reply>
  perform(request: Request, options?: PerformOptions): Promise<Reply>
  performEffect(request: Request, options?: PerformOptions): Effect.Effect<Reply>
  registerCapture(value: StableCapture): Token<"CaptureToken">
  exception(token: Token<"ExceptionToken">): unknown
  cacheSnapshot(token: Token<"CacheToken">): [string, StableCapture][]
  revoke(): void
  close(): void
}
