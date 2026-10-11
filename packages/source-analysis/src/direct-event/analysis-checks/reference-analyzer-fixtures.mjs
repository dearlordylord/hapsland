// Offline native analyzer inputs shared by the paired production measurement.
export const referenceAnalyzerSources = [
  "import type { Thing as Item } from './thing'; import { help as helper } from './help'; interface Local { value: number } function sibling(x: Local): Local { return x } export function run(item: Item): Local { helper(item); return sibling({ value: 1 }) }",
  "function f(helper: () => void) { helper(); obj.method(); factory()[key](); missing() }",
  "function helper() { return 1 } function run() { return helper }",
  "import type { String } from './types'; type Local<T> = Readonly<T>; function run(x: String): Local<String> { return x }",
  "interface Item { value: number } function help(x: Item): Item { return x } const run = (x: Item): Item => help(x)",
  "function f(x: string): string; function f(x: string) { return x }",
  "import { Effect } from 'effect'; interface Item { value: number } const run = Effect.fn('run')(function* (x: Item) { return x })"
]
