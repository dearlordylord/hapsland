import type { ResolverInput, Reply, Request } from "@hapsland/source-analysis/direct-event/graph-resolution"
import type { ArtifactAbi, Tagged, Maybe, Token } from "./artifact-abi.d.ts"
import type {
  ResolverState,
  ResolverStep,
  ResolverEvent,
  ParentAction,
  Continuation
} from "./generic-artifact-core.d.ts"
import type { Session, Command as PythonCommand, View as PythonView } from "./python-artifact-core.d.ts"
import type { Prepared, Command as GoCommand, View as GoView } from "./go-artifact-core.d.ts"

// Bend creates and consumes these retained policy values; host dispatch is closed.
declare const census: unique symbol
declare const returnValue: unique symbol
type Census = { readonly [census]: true }
type Return = { readonly [returnValue]: true }
export type StateHandle = Tagged<"ArtifactProtocol.StateHandle", { readonly invocation: bigint; readonly id: bigint }>
type Context = Tagged<
  "Context",
  {
    readonly invocation: bigint
    readonly session: Maybe<Session>
    readonly cache: Maybe<Token<"CacheToken">>
    readonly census: Census
    readonly go: Maybe<Prepared>
  }
>
type ParentCommand =
  | Tagged<"Initial", { readonly input: ArtifactAbi<ResolverInput> }>
  | Tagged<"ResumeParent", { readonly handle: StateHandle; readonly event: ResolverEvent }>
  | Tagged<"Execute", { readonly action: ParentAction }>
type PythonDispatch =
  | Tagged<"BeginPython", { readonly command: PythonCommand }>
  | Tagged<"ResumePython", { readonly handle: StateHandle; readonly reply: ArtifactAbi<Reply> }>
type GoDispatch =
  | Tagged<"BeginGo", { readonly command: GoCommand }>
  | Tagged<"ResumeGo", { readonly handle: StateHandle; readonly reply: ArtifactAbi<Reply> }>
  | Tagged<"AdvanceGo", { readonly handle: StateHandle }>
type AwaitOwner =
  | Tagged<"GoAwaitOwner" | "PythonAwait", { readonly handle: StateHandle; readonly continuation: Return }>
  | Tagged<"ParentAwait", { readonly handle: StateHandle; readonly state: ResolverState }>
  | Tagged<"FinalAwait", { readonly state: ResolverState; readonly result: ResolverStep }>
export type Step =
  | Tagged<"ParentCall", { readonly context: Context; readonly command: ParentCommand }>
  | Tagged<"PythonCall", { readonly context: Context; readonly continuation: Return; readonly command: PythonDispatch }>
  | Tagged<"GoCall", { readonly context: Context; readonly continuation: Return; readonly command: GoDispatch }>
  | Tagged<"Service", { readonly context: Context; readonly owner: AwaitOwner; readonly request: ArtifactAbi<Request> }>
  | Tagged<"Terminal", { readonly context: Context; readonly result: ResolverStep }>
declare const core: {
  initial(input: ArtifactAbi<ResolverInput>): Step
  resume(step: Step, event: ResolverEvent): Step
  receive_parent(step: Step, handle: StateHandle, continuation: Continuation): Step
  receive_python(step: Step, handle: StateHandle, view: PythonView): Step
  receive_go(step: Step, handle: StateHandle, view: GoView): Step
  view(step: Step): ResolverStep
  awaiting_request(step: Step): Maybe<ArtifactAbi<Request>>
}
export default core
