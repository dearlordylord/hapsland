declare const Game: {
  default_config(): unknown
  create_world(config: unknown, seed: bigint, budget: number, layout: number): unknown
  engine_observation(world: unknown): unknown
  observe(world: unknown): unknown
  apply(world: unknown, action: { $: "Build"; x: number; y: number; kind: number } | { $: "Upgrade"; index: number }): unknown
  tick_bounded(world: unknown, remainingEvents: bigint): unknown
}
export default Game
