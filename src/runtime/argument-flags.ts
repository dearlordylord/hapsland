import * as Flag from "effect/cli/Flag"

export const switchFlag = (name: string, aliases: ReadonlyArray<string> = [], hidden = true) => {
  let flag = Flag.Boolean(name)
  for (const alias of aliases) flag = Flag.withAlias(flag, alias)
  if (hidden) flag = Flag.withHidden(flag)
  return flag.pipe(
    Flag.atMost(1),
    Flag.map((values) => values[0] ?? false)
  )
}
export const valueFlag = (name: string) =>
  Flag.String(name).pipe(
    Flag.filter(
      (value) => value.trim() !== "" && !value.startsWith("--"),
      () => "a nonempty value"
    ),
    Flag.atMost(1),
    Flag.map((values) => values[0])
  )
