export declare const PREPARATION_SOURCE_IDENTITY: string;
export declare const SOURCE_IDENTITY: string;
export interface EngineState { $: "Types.State"; canonical: unknown; graphs: unknown; scheduler: unknown }
export interface Transition { $: "Transition"; state: EngineState; result: unknown }
export type GraphTransition = { $: "Types.GraphTransition"; state: EngineState; before: unknown; result: unknown } | { $: "Types.GraphRejected"; state: EngineState };
declare const Engine: {
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
