export declare const SOURCE_IDENTITY: string
export type RunState = object
export interface Step {
  state: RunState
  frame: unknown
  physical: unknown
}
export interface Controlled {
  state: RunState
  applied: boolean
  report: unknown
}
declare const Run: {
  create(config: unknown, seed: number): RunState
  enqueue(state: RunState, time: number, input: unknown): RunState
  step(state: RunState): Step
  step_bounded(state: RunState, endpoint: number, takeLimit: number, allowFrame: boolean): Step
  checkpoint_continue(state: RunState, endpoint: number, takeLimit: number, allowFrame: boolean): boolean
  advance(state: RunState, budget: number, endpoint: number): unknown
  advance_status(state: RunState, budget: number, endpoint: number): unknown
  advance_step_status(state: RunState, frame: unknown, budget: number, endpoint: number): unknown
  observe(state: RunState): unknown
  runtime_snapshot(state: RunState): unknown
  core(state: RunState): unknown
  replace_core(state: RunState, core: unknown): RunState
  replace_runtime(state: RunState, profile: unknown): RunState
  default_runtime(): unknown
  control(state: RunState, control: unknown): Controlled
  configure_cache(state: RunState, entries: number, bytes: number): RunState
  notice_exercise(state: RunState, scope: unknown, started: number): RunState
  bind_generated(state: RunState, key: unknown, identity: number): { state: RunState; identity: number }
  unit_key(
    partition: number,
    pair: number,
    index: number,
    bytes: number,
    seed: number,
    profile: unknown,
    limits: unknown,
    treeLabel: number,
    limitsLabel: number
  ): unknown
  input_key(
    pair: number,
    bytes: number,
    units: unknown,
    seed: number,
    profile: unknown,
    limits: unknown,
    treeLabel: number,
    limitsLabel: number
  ): unknown
  subject_key(): unknown
  normalize(state: RunState): RunState
}
export default Run
