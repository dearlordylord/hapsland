export type BendList<T> = { $: "Nil" } | { $: "Con"; head: T; tail: BendList<T> };
export type BendBool = boolean;
export interface Settings { $: "Settings"; interval: number; variation: number; edits: number; pause: number; response: number; repairDelay: number }
export interface Stream { $: "Stream"; random: number; phase: number; edit: number; task: bigint; revision: bigint; generation: bigint; suspended: BendBool; pendingPhase: number; pendingEdit: number; pendingTask: bigint; bytes: bigint; units: BendList<bigint> }
export interface Emission { $: "Emission"; delay: number; kind: number; task: bigint; revision: bigint; generation: bigint; bytes: bigint; units: BendList<bigint>; repair: BendBool; recurring: BendBool }
export interface Changed { $: "Changed"; state: Stream; events: BendList<Emission> }
declare const Shared: {
 initial(config: Settings, seed: number, codes: BendList<number>, bytes: bigint, units: BendList<bigint>): Stream;
 next(config: Settings, state: Stream): Changed;
 finish_state(s: Stream, continuation: BendBool): Stream;
 on_finish(config: Settings, state: Stream, continuation: BendBool): Changed;
 on_advice(config: Settings, state: Stream): Changed;
 transition_state(t: Changed): Stream;
 transition_events(t: Changed): BendList<Emission>;
 state_generation(s: Stream): bigint;
 set_interval(config: Settings, interval: number): Settings;
 rewind(config: Settings, s: Stream): Changed;
 sizes(s: Stream, bytes: bigint, units: BendList<bigint>): Stream;
 suspend(config: Settings, s: Stream, suspended: BendBool): Changed;
 burst(count: bigint, s: Stream): Changed;
};
export default Shared;
