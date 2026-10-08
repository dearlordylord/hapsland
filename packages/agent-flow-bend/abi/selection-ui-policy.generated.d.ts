/** Source-free UI decisions; the native host owns strings, payload arrays, arithmetic and terminal effects. */
export type SelectionUiFacts<Model, Options> = Readonly<{
  back: (model: Model, options: Options) => boolean
  backRow: (model: Model, options: Options) => boolean
  exitRow: (model: Model, options: Options) => boolean
  nonempty: (model: Model, options: Options) => boolean
  selectAll: (model: Model, options: Options) => boolean
  choiceIds: (model: Model, options: Options) => readonly string[]
  choiceId: (model: Model, options: Options, choices: readonly string[]) => string | undefined
  allSelected: (model: Model, options: Options, choices: readonly string[]) => boolean
  choicePresent: (model: Model, options: Options, choices: readonly string[], choiceId: string | undefined) => boolean
  choiceSelected: (model: Model, options: Options, choices: readonly string[], choiceId: string | undefined) => boolean
}>
export type SelectionUiApply<Model, Options, Result> = Readonly<{
  hold: (model: Model, options: Options) => Result
  back: (model: Model, options: Options) => Result
  cancel: (model: Model, options: Options) => Result
  move: (model: Model, options: Options, movement: -1 | 1) => Result
  first: (model: Model, options: Options) => Result
  last: (model: Model, options: Options) => Result
  select: (model: Model, options: Options) => Result
  warn: (model: Model, options: Options) => Result
  clearAll: (model: Model, options: Options, choices: readonly string[]) => Result
  chooseAll: (model: Model, options: Options, choices: readonly string[]) => Result
  removeChoice: (model: Model, options: Options, choices: readonly string[], choiceId: string | undefined) => Result
  addChoice: (model: Model, options: Options, choices: readonly string[], choiceId: string | undefined) => Result
}>
export declare const selectionUiBindUpdate: <Model, Options, Result>(facts: SelectionUiFacts<Model, Options>, apply: SelectionUiApply<Model, Options, Result>) => (model: Model, key: string, options: Options) => Result
