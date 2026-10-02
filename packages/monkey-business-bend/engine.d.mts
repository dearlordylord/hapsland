export declare const PREPARATION_SOURCE_IDENTITY: string;
export declare const SOURCE_IDENTITY: string;
export interface EngineState { $: "Types.State"; canonical: unknown; graphs: unknown; scheduler: unknown; workloads: unknown; random: unknown }
export interface Transition { $: "Transition"; state: EngineState; result: unknown }
export type GraphTransition = { $: "Types.GraphTransition"; state: EngineState; before: unknown; result: unknown } | { $: "Types.GraphRejected"; state: EngineState };
declare const Engine: {
 pre_issue(state: EngineState, facts: unknown): unknown;
 permit_actions(state: EngineState, capture: unknown): unknown;
 session_delay(settings: unknown, random: number): number;
 clock(state: EngineState): number;
 configure_seed(state: EngineState, seed: bigint): EngineState;
 configure_workload(state: EngineState, partition: bigint, profile: unknown): EngineState;
 workload_action(state: EngineState, partition: bigint, action: unknown): { state: EngineState; events: unknown; valid: boolean };
 workload_valid(state: EngineState, partition: bigint, generation: bigint, recurring: boolean): boolean;
 workload_duration(state: EngineState, partition: bigint, fallback: bigint): number;
 pre_timing(state: EngineState, partition: bigint, provided: unknown, fallback: bigint, lifetime: bigint): unknown;
 sample_outcome(state: EngineState, weights: unknown): { state: EngineState; outcome: number };
 /** Positive sampler-domain binary64: finite sum <=600; no overflow/NaN. */
 numeric_add(a: unknown, b: unknown): unknown;
 /** Positive total, operands <=600 and ratio <=1 (subnormals included). */
 numeric_divide(a: unknown, b: unknown): unknown;
 random_initial(seed: bigint): number;
 random_sample(random: number, weights: unknown): { random: number; outcome: number };
 session_initial(settings: unknown, seed: number, codes: unknown, bytes: bigint, units: unknown): unknown;
 session_next(settings: unknown, stream: unknown): unknown;
 session_generation(stream: unknown): number;
 session_sizes(stream: unknown, bytes: bigint, units: unknown): unknown;
 session_burst(count: bigint, stream: unknown): unknown;
 session_interval(settings: unknown, interval: number): unknown;
 session_rewind(settings: unknown, stream: unknown): unknown;
 session_suspend(settings: unknown, stream: unknown, suspended: boolean): unknown;
 session_finish(stream: unknown, continuation: boolean): unknown;
 session_advice(settings: unknown, stream: unknown): unknown;
 enqueue(state: EngineState, at: bigint, order: bigint): EngineState;
 take(state: EngineState): { state: EngineState; entry: unknown };
 queued(state: EngineState): unknown;
 cancel(state: EngineState, order: bigint): EngineState;
 initial(limits: unknown): EngineState;
 canonical(state: EngineState): unknown;
 step(state: EngineState, event: unknown): Transition;
 graph_step(state: EngineState, key: unknown, position: bigint, limits: unknown, event: unknown): GraphTransition;
 revalidate(state: EngineState, context: unknown): unknown;
 fence(state: EngineState, event: unknown, generated: boolean, context: unknown): unknown;
 after(before: EngineState, state: EngineState, event: unknown): unknown;
 edit(state: EngineState, partition: bigint, lifetime: bigint): unknown;
 preparation_fact_time(delay: bigint, index: bigint, count: bigint): bigint;
 preparation_completed(partition: bigint, lifetime: bigint, round: bigint, operation: bigint, units: unknown, delay: bigint): unknown;
 handle(state: EngineState, event: unknown, command: unknown, context: unknown): unknown;
 retire(state: EngineState, operation: bigint): EngineState;
};
export default Engine;
