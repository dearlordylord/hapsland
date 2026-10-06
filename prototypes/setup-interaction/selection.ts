// THROWAWAY: first-dialog UI state only; it owns no setup or credential operations.
import { Effect, Terminal } from "effect"
import * as Prompt from "effect/cli/Prompt"
type SelectionAnswer = { kind: "select"; hosts: string[] } | { kind: "back" | "cancel" }
export const agents = ["Claude", "Codex", "Pi"] as const
export type SelectionState = { focus: number; selected: string[]; warning: boolean }
export type SelectionOptions = {
  message: string
  choices: readonly { id: string; title: string }[]
  back: boolean
  emptyWarning?: string
}
const defaults: SelectionOptions = {
  message: "Select agents",
  choices: agents.map((id) => ({ id, title: id })),
  back: false,
  emptyWarning: "Select at least one agent."
}
export function selectionUpdate(
  state: SelectionState,
  key: string,
  options: SelectionOptions = defaults
): Prompt.Action<SelectionState, SelectionAnswer> {
  const agents = options.choices.map((choice) => choice.id)
  const lastRow = agents.length + 2 + Number(options.back)
  if (key === "escape") return { _tag: "Submit", value: { kind: options.back ? "back" : "cancel" } }
  if (key === "up" || key === "down" || key === "tab")
    return {
      _tag: "NextFrame",
      state: { ...state, focus: (state.focus + (key === "up" ? lastRow : 1)) % (lastRow + 1), warning: false }
    }
  if (key === "home") return { _tag: "NextFrame", state: { ...state, focus: 0, warning: false } }
  if (key === "end") return { _tag: "NextFrame", state: { ...state, focus: lastRow, warning: false } }
  if (key === "return" || key === "enter") {
    if (options.back && state.focus === lastRow - 1) return { _tag: "Submit", value: { kind: "back" } }
    if (state.focus === lastRow) return { _tag: "Submit", value: { kind: "cancel" } }
    return state.selected.length
      ? { _tag: "Submit", value: { kind: "select", hosts: [...state.selected] } }
      : { _tag: "NextFrame", state: { ...state, warning: true } }
  }
  if (key === "space") {
    if (state.focus === 1)
      return {
        _tag: "NextFrame",
        state: { ...state, selected: state.selected.length === agents.length ? [] : [...agents], warning: false }
      }
    const host = agents[state.focus - 2]
    if (host) {
      const selected = state.selected.includes(host)
        ? state.selected.filter((item) => item !== host)
        : agents.filter((item) => item === host || state.selected.includes(item))
      return { _tag: "NextFrame", state: { ...state, selected, warning: false } }
    }
  }
  return { _tag: "NextFrame", state }
}
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
export function selectionFrame(
  state: SelectionState,
  columns: number,
  rows: number,
  options: SelectionOptions = defaults
): string[] {
  const agents = options.choices.map((choice) => choice.id)
  const lastRow = agents.length + 2 + Number(options.back)
  const width = Math.max(1, columns)
  const header = [
    options.message,
    state.warning ? (options.emptyWarning ?? "Select at least one option.") : `${state.selected.length} selected`
  ].flatMap((line) => wrap(line, width))
  const footer = [
    "Arrows: move",
    "Space: select",
    state.focus === lastRow
      ? "Enter: Exit"
      : options.back && state.focus === lastRow - 1
        ? "Enter: Back"
        : "Enter: Continue",
    options.back ? "Esc: Back" : "Esc: Exit"
  ].flatMap((line) => wrap(line, width))
  const all = state.selected.length === agents.length ? "x" : state.selected.length ? "-" : " "
  const labels = [
    "Continue",
    `[${all}] Select All`,
    ...options.choices.map(({ id, title }) => `[${state.selected.includes(id) ? "x" : " "}] ${title}`),
    ...(options.back ? ["Back"] : []),
    "Exit"
  ]
  const choices = labels.map((label, index) => wrap(`${index === state.focus ? ">" : " "} ${label}`, width))
  const budget = Math.max(1, rows - header.length - footer.length)
  const fits = choices.flat().length <= budget
  const start = fits ? 0 : state.focus
  const visible: string[] = []
  for (let index = start; index < choices.length; index++) {
    const item = choices[index]!
    if (visible.length && visible.length + item.length > budget) break
    visible.push(...item)
  }
  return [...header, ...visible, ...footer]
}
export function selectionPrompt(
  selected: readonly string[],
  options: SelectionOptions = defaults
): Prompt.Prompt<SelectionAnswer> {
  const agents = options.choices.map((choice) => choice.id)
  let lastFrame: string[] = []
  return Prompt.Custom<SelectionState, SelectionAnswer>(
    { focus: 0, selected: agents.filter((host) => selected.includes(host)), warning: false },
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
