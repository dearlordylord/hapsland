declare const Game: {
  create_scenario(scenario: { $: "Scenario"; jev: number; delivery: number; source: number; ready: boolean;
    readable: boolean; result: number; burst: number; interval: number },
    seed: number, budget: number, layout: number): unknown
  build_tuned(world: unknown, x: number, y: number, kind: number, price: number, strength: number, radius: number): unknown
  schedule_finish(world: unknown,at: number): unknown
  engine_observation(world: unknown): unknown
  observe(world: unknown): unknown
  apply(world: unknown, action: { $: "Build"; x: number; y: number; kind: number } | { $: "Upgrade"; index: number }
    | { $: "Fire"; index: number; operation: number }): unknown
  shot_targets(world: unknown, index: number, operation: number): unknown
  shot_target(world: unknown, index: number, operation: number): unknown
  tick_bounded(world: unknown, remainingEvents: number): unknown
  automatic(world: unknown): unknown
  visual_state(world: unknown): unknown
}
export default Game
