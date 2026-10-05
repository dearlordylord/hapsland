export type GameAbility =
  | { readonly $: "DependencyAcceleration" | "FutureBatching" | "LaunchPacing" | "Refinement" }
  | { readonly $: "OutputLatency"; readonly outcome: number; readonly delay: bigint; readonly lease: bigint }
export type GameAction =
  | { readonly $: "Unsupported" }
  | { readonly $: "OutputTiming"; readonly outcome: number; readonly delay: bigint; readonly lease: bigint }
  | { readonly $: "FutureReview"; readonly delay: bigint; readonly weights: unknown }
declare const mechanics: {
  translate(ability: GameAbility): GameAction
  refined_weights(): unknown
}
export default mechanics
