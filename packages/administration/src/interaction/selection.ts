// Administration: first-dialog UI state only; it owns no setup or credential operations.
import { Effect, Terminal } from "effect"
import * as Prompt from "effect/cli/Prompt"
import { bindSelectionUiUpdate } from "@hapsland/canonical-policy/canonical/selection-ui-adapter"
type SelectionAnswer = { kind: "select"; ids: string[] } | { kind: "back" | "cancel" }
export type SelectionState = { focus: number; selected: string[]; warning: boolean }
export type SelectionOptions = {
  message: string
  choices: readonly { id: string; title: string }[]
  back: boolean
  emptyWarning?: string
}
const nextFrame = (state: SelectionState): Prompt.Action<SelectionState, SelectionAnswer> => ({
  _tag: "NextFrame",
  state
})
const lastRow = (options: SelectionOptions) => options.choices.length + 2 + Number(options.back)
export const selectionUpdate = bindSelectionUiUpdate<
  SelectionState,
  SelectionOptions,
  Prompt.Action<SelectionState, SelectionAnswer>
>(
  {
    back: (_state, options) => options.back,
    backRow: (state, options) => options.back && state.focus === lastRow(options) - 1,
    exitRow: (state, options) => state.focus === lastRow(options),
    nonempty: (state) => state.selected.length > 0,
    selectAll: (state) => state.focus === 1,
    choiceIds: (_state, options) => options.choices.map((choice) => choice.id),
    choiceId: (state, _options, choices) => choices[state.focus - 2],
    allSelected: (state, _options, choices) => state.selected.length === choices.length,
    choicePresent: (_state, _options, _choices, choiceId) => Boolean(choiceId),
    choiceSelected: (state, _options, _choices, choiceId) => state.selected.includes(choiceId!)
  },
  {
    hold: nextFrame,
    back: () => ({ _tag: "Submit", value: { kind: "back" } }),
    cancel: () => ({ _tag: "Submit", value: { kind: "cancel" } }),
    move: (state, options, movement) =>
      nextFrame({
        ...state,
        focus: (state.focus + movement + lastRow(options) + 1) % (lastRow(options) + 1),
        warning: false
      }),
    first: (state) => nextFrame({ ...state, focus: 0, warning: false }),
    last: (state, options) => nextFrame({ ...state, focus: lastRow(options), warning: false }),
    select: (state) => ({ _tag: "Submit", value: { kind: "select", ids: [...state.selected] } }),
    warn: (state) => nextFrame({ ...state, warning: true }),
    clearAll: (state) => nextFrame({ ...state, selected: [], warning: false }),
    chooseAll: (state, _options, choices) => nextFrame({ ...state, selected: [...choices], warning: false }),
    removeChoice: (state, _options, _choices, choiceId) => {
      return nextFrame({ ...state, selected: state.selected.filter((item) => item !== choiceId), warning: false })
    },
    addChoice: (state, _options, choices, choiceId) => {
      return nextFrame({
        ...state,
        selected: choices.filter((item) => item === choiceId || state.selected.includes(item)),
        warning: false
      })
    }
  }
)
function wrap(line: string, columns: number): string[] {
  const lines: string[] = []
  while (line.length > columns) {
    const at = line.lastIndexOf(" ", columns)
    const split = at > 0 ? at : columns
    lines.push(line.slice(0, split))
    line = line.slice(split).trimStart()
  }
  return [...lines, line]
}
const enterHint = (state: SelectionState, options: SelectionOptions) => {
  if (state.focus === lastRow(options)) return "Enter: Exit"
  return options.back && state.focus === lastRow(options) - 1 ? "Enter: Back" : "Enter: Continue"
}
const selectionLabels = (state: SelectionState, options: SelectionOptions) => {
  const all = state.selected.length === options.choices.length ? "x" : state.selected.length ? "-" : " "
  return [
    "Continue",
    `[${all}] Select All`,
    ...options.choices.map(({ id, title }) => `[${state.selected.includes(id) ? "x" : " "}] ${title}`),
    ...(options.back ? ["Back"] : []),
    "Exit"
  ]
}
const visibleRows = (choices: string[][], focus: number, budget: number) => {
  const start = choices.flat().length <= budget ? 0 : focus
  const visible: string[] = []
  for (let index = start; index < choices.length; index++) {
    const item = choices[index]!
    if (visible.length && visible.length + item.length > budget) break
    visible.push(...item)
  }
  return visible
}
export function selectionFrame(
  state: SelectionState,
  columns: number,
  rows: number,
  options: SelectionOptions
): string[] {
  const width = Math.max(1, columns)
  const header = [
    options.message,
    state.warning ? (options.emptyWarning ?? "Select at least one option.") : `${state.selected.length} selected`
  ].flatMap((line) => wrap(line, width))
  const footer = [
    "Arrows: move",
    "Space: select",
    enterHint(state, options),
    options.back ? "Esc: Back" : "Esc: Exit"
  ].flatMap((line) => wrap(line, width))
  const choices = selectionLabels(state, options).map((label, index) =>
    wrap(`${index === state.focus ? ">" : " "} ${label}`, width)
  )
  const budget = Math.max(1, rows - header.length - footer.length)
  return [...header, ...visibleRows(choices, state.focus, budget), ...footer]
}
export function selectionPrompt(
  selected: readonly string[],
  options: SelectionOptions
): Prompt.Prompt<SelectionAnswer> {
  const choiceIds = options.choices.map((choice) => choice.id)
  let lastFrame: string[] = []
  return Prompt.Custom<SelectionState, SelectionAnswer>(
    { focus: 0, selected: choiceIds.filter((choiceId) => selected.includes(choiceId)), warning: false },
    {
      render: (state, action) =>
        Effect.gen(function* () {
          if (action._tag === "Submit")
            return action.value.kind === "cancel"
              ? "Exited selection.\r\n"
              : action.value.kind === "back"
                ? "Back.\r\n"
                : "Selection submitted.\r\n"
          const terminal = yield* Terminal.Terminal
          lastFrame = selectionFrame(state, yield* terminal.columns, yield* terminal.rows, options)
          return "\u001b[?25l" + lastFrame.join("\r\n") + "\r\n"
        }),
      process: (input, state) => Effect.succeed(selectionUpdate(state, input.key.name, options)),
      clear: () =>
        Effect.gen(function* () {
          const terminal = yield* Terminal.Terminal
          const columns = Math.max(1, yield* terminal.columns)
          const rows = lastFrame.reduce((total, line) => total + Math.max(1, Math.ceil(line.length / columns)), 0)
          return "\u001b[1A\u001b[2K".repeat(rows) + "\r"
        })
    }
  )
}
