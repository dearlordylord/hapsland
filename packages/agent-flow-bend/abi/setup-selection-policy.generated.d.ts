/** Source-free outer setup navigation ABI; native payload copying and arithmetic remain in the host. */
export type SetupSelectionPhase = "SelectingAgents" | "RunningAgents" | "Done" | "Cancelled"
export type SetupSelectionFacts<Model, Action> = Readonly<{
  nonempty: (model: Model, action: Action) => boolean
  hasNext: (model: Model, action: Action) => boolean
}>
export type SetupSelectionApply<Model, Action> = Readonly<{
  start: (model: Model, action: Action) => Model
  end: (model: Model, action: Action) => Model
  observed: (model: Model, action: Action, phase: SetupSelectionPhase) => Model
}>
export declare const setupSelectionBindReducer: <Model extends { phase: SetupSelectionPhase }, Action extends { kind: "selected" | "ended" | "observed" }>(facts: SetupSelectionFacts<Model, Action>, apply: SetupSelectionApply<Model, Action>) => (model: Model, action: Action) => Model
