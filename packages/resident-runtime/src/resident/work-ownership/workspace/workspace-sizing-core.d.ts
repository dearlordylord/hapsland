import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
export type Mode = Tagged<"WorkspaceCapture" | "WorkspaceAnalysis">
export type Primitive = Tagged<
  | "WorkspaceIdentity"
  | "WorkspaceIsUndefined"
  | "WorkspaceIsNullish"
  | "WorkspaceSafeInteger"
  | "WorkspaceLess"
  | "WorkspaceGreater"
  | "WorkspaceTruthy"
  | "WorkspaceMeasure"
  | "WorkspaceMultiply"
  | "WorkspaceAdd"
>
export type Literal = Tagged<
  | "WorkspaceMaxSource"
  | "WorkspaceMaxDeclarations"
  | "WorkspaceZero"
  | "WorkspaceEight"
  | "WorkspaceFour"
  | "WorkspaceMetadataMargin"
  | "WorkspaceAnalysisMargin"
  | "WorkspaceImportWorkspace"
>
export type Operation =
  | Tagged<"WorkspaceConstant", { readonly target: number; readonly value: Literal }>
  | Tagged<"WorkspaceReadOptional", { readonly target: number; readonly source: number; readonly field: string }>
  | Tagged<
      "WorkspaceCall",
      { readonly target: number; readonly primitive: Primitive; readonly arguments: List<number> }
    >
  | Tagged<
      "WorkspaceBranch",
      {
        readonly primitive: Primitive
        readonly arguments: List<number>
        readonly yes: List<Operation>
        readonly no: List<Operation>
      }
    >
  | Tagged<"WorkspaceInvalidSource">
export type Step =
  | Tagged<
      "WorkspaceAwait",
      { readonly operation: Operation; readonly remaining: List<Operation>; readonly result: number }
    >
  | Tagged<"WorkspaceDone", { readonly result: number }>
  | Tagged<"WorkspaceRejected">
export type Reply = Tagged<"WorkspaceAck"> | Tagged<"WorkspaceFlag", { readonly value: boolean }>
declare const core: { initial(mode: Mode): Step; resume(step: Step, reply: Reply): Step }
export default core
