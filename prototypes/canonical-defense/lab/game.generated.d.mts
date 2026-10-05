declare const Game: {
  create_scenario(scenario: { $: "Scenario"; jev: bigint; delivery: bigint; source: bigint; ready: boolean;
    readable: boolean; result: number; burst: number; interval: number },
    seed: bigint, budget: number, layout: number): unknown
  build_tuned(world: unknown, x: number, y: number, kind: number, price: number, strength: number, radius: number): unknown
  engine_observation(world: unknown): unknown
  observe(world: unknown): unknown
  apply(world: unknown, action: { $: "Build"; x: number; y: number; kind: number } | { $: "Upgrade"; index: number }): unknown
  tick_bounded(world: unknown, remainingEvents: bigint): unknown
}
export default Game
