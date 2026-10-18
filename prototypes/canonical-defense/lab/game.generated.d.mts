declare const Game: {
  create_scenario(scenario: { $: "Scenario"; jev: bigint; delivery: bigint; source: bigint; ready: boolean;
    readable: boolean; result: number; burst: number; interval: number },
    seed: bigint, budget: number, layout: number): unknown
  build_tuned(world: unknown, x: number, y: number, kind: number, price: number, strength: number, radius: number): unknown
  schedule_finish(world: unknown,at: bigint): unknown
  engine_observation(world: unknown): unknown
  observe(world: unknown): unknown
  apply(world: unknown, action: { $: "Build"; x: number; y: number; kind: number } | { $: "Upgrade"; index: number }
    | { $: "Fire"; index: number; operation: bigint }): unknown
  shot_target(world: unknown, index: number, operation: bigint): unknown
  tick_bounded(world: unknown, remainingEvents: bigint): unknown
  automatic(world: unknown): unknown
  visual_state(world: unknown): unknown
}
export default Game
