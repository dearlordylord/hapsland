export type BendList<T> = { $: "Nil" } | { $: "Con"; head: T; tail: BendList<T> }
export type BendBool = boolean
export interface Settings {
  $: "Session.Settings"
  interval: number
  variation: number
  edits: number
  pause: number
  response: number
  repairDelay: number
}
export interface Stream {
  $: "Session.Stream"
  random: number
  phase: number
  edit: number
  task: number
  revision: number
  generation: number
  suspended: BendBool
  pendingPhase: number
  pendingEdit: number
  pendingTask: number
  bytes: number
  units: BendList<number>
}
export interface Emission {
  $: "Session.Emission"
  delay: number
  kind: number
  task: number
  revision: number
  generation: number
  bytes: number
  units: BendList<number>
  repair: BendBool
  recurring: BendBool
}
export interface Changed {
  $: "Session.Changed"
  state: Stream
  events: BendList<Emission>
}
declare const Shared: {
  initial(config: Settings, seed: number, codes: BendList<number>, bytes: bigint, units: BendList<bigint>): Stream
  next(config: Settings, state: Stream): Changed
  finish_state(s: Stream, continuation: BendBool): Stream
  on_finish(config: Settings, state: Stream, continuation: BendBool): Changed
  on_advice(config: Settings, state: Stream): Changed
  transition_state(t: Changed): Stream
  transition_events(t: Changed): BendList<Emission>
  state_generation(s: Stream): number
  set_interval(config: Settings, interval: number): Settings
  rewind(config: Settings, s: Stream): Changed
  sizes(s: Stream, bytes: bigint, units: BendList<bigint>): Stream
  suspend(config: Settings, s: Stream, suspended: BendBool): Changed
  burst(count: bigint, s: Stream): Changed
}
export default Shared
