import { sha256, type FileSnapshot } from "./file-snapshots.ts"
import { type JsonObject, isObject } from "./configuration-values.ts"
import { parse as parseToml } from "smol-toml"

export const HOOKS_FEATURE_FINGERPRINT = sha256("features.hooks=true")

export const validateToml = (file: FileSnapshot): JsonObject => {
  if (!file.exists || file.content.trim() === "") return {}
  try {
    const parsed = parseToml(file.content)
    if (!isObject(parsed)) throw new Error("not an object")
    return parsed
  } catch {
    throw new Error(`configuration is malformed TOML: ${file.path}`)
  }
}

interface TomlLine {
  readonly start: number
  readonly contentEnd: number
  readonly end: number
  readonly text: string
  readonly syntactic: boolean
}

type MultilineDelimiter = '"""' | "'''" | undefined

const tomlDelimiterAt = (line: string, index: number): MultilineDelimiter => {
  if (line.startsWith('"""', index)) return '"""'
  if (line.startsWith("'''", index)) return "'''"
  return undefined
}

const isTomlQuote = (character: string | undefined): character is '"' | "'" => character === '"' || character === "'"

const isTomlTerminator = (line: string, index: number, delimiter: string) =>
  line.startsWith(delimiter, index) && (delimiter.startsWith("'") || index === 0 || line[index - 1] !== "\\")

const advanceTomlMultiline = (line: string, index: number, multiline: Exclude<MultilineDelimiter, undefined>) =>
  isTomlTerminator(line, index, multiline) ? { index: index + 2, multiline: undefined } : { index, multiline }

const advanceTomlQuote = (line: string, index: number, quote: '"' | "'") =>
  isTomlTerminator(line, index, quote) ? undefined : quote

const advanceTomlStringState = (line: string, initial: MultilineDelimiter): MultilineDelimiter => {
  let multiline = initial
  let quote: '"' | "'" | undefined
  for (let index = 0; index < line.length; index += 1) {
    if (multiline !== undefined) {
      ;({ index, multiline } = advanceTomlMultiline(line, index, multiline))
      continue
    }
    const character = line[index]
    if (quote !== undefined) {
      quote = advanceTomlQuote(line, index, quote)
      continue
    }
    if (character === "#") break
    const delimiter = tomlDelimiterAt(line, index)
    if (delimiter !== undefined) {
      multiline = delimiter
      index += 2
      continue
    }
    if (isTomlQuote(character)) quote = character
  }
  return multiline
}

const tomlLines = (content: string): ReadonlyArray<TomlLine> => {
  const lines: Array<TomlLine> = []
  let offset = 0
  let multiline: MultilineDelimiter
  while (offset < content.length) {
    const newline = content.indexOf("\n", offset)
    const end = newline < 0 ? content.length : newline + 1
    const contentEnd =
      newline < 0 ? content.length : newline > offset && content[newline - 1] === "\r" ? newline - 1 : newline
    const text = content.slice(offset, contentEnd)
    const syntactic = multiline === undefined
    lines.push({ start: offset, contentEnd, end, text, syntactic })
    multiline = advanceTomlStringState(text, multiline)
    offset = end
  }
  return lines
}

const tableHeader = (line: string): "features" | "other" | undefined => {
  const trimmed = line.trimStart()
  if (!trimmed.startsWith("[")) return undefined
  try {
    const parsed = parseToml(`${line}\n__review_tool_probe__ = true\n`)
    return isObject(parsed.features) && parsed.features.__review_tool_probe__ === true ? "features" : "other"
  } catch {
    return "other"
  }
}

const isHooksAssignment = (line: string): boolean => {
  try {
    const parsed = parseToml(`["features"]\n${line}\n`)
    return isObject(parsed.features) && "hooks" in parsed.features
  } catch {
    return false
  }
}

const locateFeaturesSyntax = (content: string) => {
  let inFeatures = false
  let header: TomlLine | undefined
  let hooks: TomlLine | undefined
  for (const line of tomlLines(content)) {
    if (!line.syntactic) continue
    const table = tableHeader(line.text)
    if (table !== undefined) {
      inFeatures = table === "features"
      if (inFeatures) header = line
      continue
    }
    if (inFeatures && isHooksAssignment(line.text)) hooks = line
  }
  return { header, hooks }
}

const hooksFeature = (parsed: unknown) => {
  const features = isObject(parsed) ? parsed.features : undefined
  return isObject(features) ? features.hooks : undefined
}

const insertHooksFeature = (content: string): string => {
  const syntax = locateFeaturesSyntax(content)
  if (syntax.header === undefined) {
    const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n"
    return `${content}${separator}${content.length === 0 ? "" : "\n"}[features]\nhooks = true\n`
  }
  const newline = content.slice(syntax.header.contentEnd, syntax.header.end) || "\n"
  return `${content.slice(0, syntax.header.contentEnd)}${newline}hooks = true${content.slice(syntax.header.contentEnd)}`
}

export const assertHooksSemanticState = (content: string, expected: true | "absent") => {
  let parsed: unknown
  try {
    parsed = parseToml(content)
  } catch {
    throw new Error("generated config.toml is invalid; no configuration was written")
  }
  const hooks = hooksFeature(parsed)
  if ((expected === true && hooks !== true) || (expected === "absent" && hooks !== undefined)) {
    throw new Error("generated config.toml does not have the required hooks feature state")
  }
}

export const enableHooksFeature = (file: FileSnapshot): string => {
  const parsed = validateToml(file)
  const features = parsed.features
  if (features !== undefined && !isObject(features)) {
    throw new Error("config.toml [features] must be a table")
  }
  const current = isObject(features) ? features.hooks : undefined
  if (current === false) {
    throw new Error("Codex hooks are explicitly disabled; installation will not override user or managed policy")
  }
  if (current === true) return file.content
  if (current !== undefined) throw new Error("config.toml features.hooks must be a boolean")
  const next = insertHooksFeature(file.content)
  assertHooksSemanticState(next, true)
  return next
}

export const disableOwnedFeature = (content: string): string => {
  const hooks = locateFeaturesSyntax(content).hooks
  if (hooks === undefined) throw new Error("owned Codex feature entry is missing or locally modified")
  const next = `${content.slice(0, hooks.start)}${content.slice(hooks.end)}`
  assertHooksSemanticState(next, "absent")
  return next
}
