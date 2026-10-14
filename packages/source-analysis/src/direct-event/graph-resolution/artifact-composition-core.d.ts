import type { ResolverInput, Reply, Request } from "@hapsland/source-analysis/direct-event/graph-resolution"
import type { Tagged, Maybe, Token } from "./composition/artifact-abi.d.ts"
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
export type StateHandle = Tagged<
  "composition/ArtifactProtocol.StateHandle",
  { readonly invocation: bigint; readonly id: bigint }
>
type Context = Tagged<
  "composition/ArtifactComposition.Context",
  {
    readonly invocation: bigint
    readonly session: Maybe<Session>
    readonly cache: Maybe<Token<"CacheToken">>
    readonly census: Census
    readonly go: Maybe<Prepared>
  }
>
type ParentCommand =
  | Tagged<"composition/ArtifactComposition.Initial", { readonly input: ResolverInput }>
  | Tagged<
      "composition/ArtifactComposition.ResumeParent",
      { readonly handle: StateHandle; readonly event: ResolverEvent }
    >
  | Tagged<"composition/ArtifactComposition.Execute", { readonly action: ParentAction }>
type PythonDispatch =
  | Tagged<"composition/ArtifactComposition.BeginPython", { readonly command: PythonCommand }>
  | Tagged<"composition/ArtifactComposition.ResumePython", { readonly handle: StateHandle; readonly reply: Reply }>
type GoDispatch =
  | Tagged<"composition/ArtifactComposition.BeginGo", { readonly command: GoCommand }>
  | Tagged<"composition/ArtifactComposition.ResumeGo", { readonly handle: StateHandle; readonly reply: Reply }>
  | Tagged<"composition/ArtifactComposition.AdvanceGo", { readonly handle: StateHandle }>
type AwaitOwner =
  | Tagged<
      "composition/ArtifactComposition.GoAwaitOwner" | "composition/ArtifactComposition.PythonAwait",
      { readonly handle: StateHandle; readonly continuation: Return }
    >
  | Tagged<
      "composition/ArtifactComposition.ParentAwait",
      { readonly handle: StateHandle; readonly state: ResolverState }
    >
  | Tagged<
      "composition/ArtifactComposition.FinalAwait",
      { readonly state: ResolverState; readonly result: ResolverStep }
    >
export type Step =
  | Tagged<"composition/ArtifactComposition.ParentCall", { readonly context: Context; readonly command: ParentCommand }>
  | Tagged<
      "composition/ArtifactComposition.PythonCall",
      { readonly context: Context; readonly continuation: Return; readonly command: PythonDispatch }
    >
  | Tagged<
      "composition/ArtifactComposition.GoCall",
      { readonly context: Context; readonly continuation: Return; readonly command: GoDispatch }
    >
  | Tagged<
      "composition/ArtifactComposition.Service",
      { readonly context: Context; readonly owner: AwaitOwner; readonly request: Request }
    >
  | Tagged<"composition/ArtifactComposition.Terminal", { readonly context: Context; readonly result: ResolverStep }>
declare const core: {
  initial(input: ResolverInput): Step
  resume(step: Step, event: ResolverEvent): Step
  receive_parent(step: Step, handle: StateHandle, continuation: Continuation): Step
  receive_python(step: Step, handle: StateHandle, view: PythonView): Step
  receive_go(step: Step, handle: StateHandle, view: GoView): Step
  view(step: Step): ResolverStep
  awaiting_request(step: Step): Maybe<Request>
}
export default core
