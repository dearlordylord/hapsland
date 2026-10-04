export class JsoncParseError extends Error {
  readonly code = "jsonc_parse_error" as const

  constructor(message: string) {
    super(message)
    this.name = "JsoncParseError"
  }
}

type StringState = { inString: boolean; escaped: boolean }
const advanceString = (state: StringState, current: string): void => {
  if (state.escaped) state.escaped = false
  else if (current === "\\") state.escaped = true
  else if (current === '"') state.inString = false
}
const commentPadding = (current: string): string => (/[\r\n]/.test(current) ? current : " ")
type CommentState = StringState & {
  output: string
  index: number
  lineComment: boolean
  blockComment: boolean
  blockStart: number
}
const scanLineComment = (state: CommentState, current: string): void => {
  if (/[\r\n]/.test(current)) state.lineComment = false
  state.output += commentPadding(current)
}
const scanBlockComment = (state: CommentState, current: string, next: string | undefined): void => {
  if (current === "*" && next === "/") {
    state.blockComment = false
    state.output += "  "
    state.index++
  } else state.output += commentPadding(current)
}
const scanCommentOpening = (state: CommentState, current: string, next: string | undefined): void => {
  if (current === '"') state.inString = true
  if (current === "/" && next === "/") {
    state.lineComment = true
    state.output += "  "
    state.index++
  } else if (current === "/" && next === "*") {
    state.blockComment = true
    state.blockStart = state.index
    state.output += "  "
    state.index++
  } else state.output += current
}
const scanCommentCharacter = (state: CommentState, text: string): void => {
  const current = text[state.index]!
  const next = text[state.index + 1]
  if (state.lineComment) scanLineComment(state, current)
  else if (state.blockComment) scanBlockComment(state, current, next)
  else if (state.inString) {
    state.output += current
    advanceString(state, current)
  } else scanCommentOpening(state, current, next)
}
const assertCommentsClosed = (state: CommentState): void => {
  if (state.inString) throw new JsoncParseError("unterminated string literal")
  if (state.blockComment) throw new JsoncParseError(`unterminated comment at offset ${state.blockStart}`)
}
/** Remove comments while preserving line/column offsets for diagnostics. */
const stripComments = (text: string): string => {
  const state: CommentState = {
    output: "",
    index: 0,
    inString: false,
    escaped: false,
    lineComment: false,
    blockComment: false,
    blockStart: -1
  }
  for (; state.index < text.length; state.index++) scanCommentCharacter(state, text)
  assertCommentsClosed(state)
  return state.output
}
const trailingComma = (text: string, index: number): boolean => {
  let cursor = index + 1
  while (/\s/.test(text[cursor] ?? "")) cursor++
  return text[cursor] === "}" || text[cursor] === "]"
}
const scanTrailingCommaCharacter = (state: StringState, text: string, index: number): string => {
  const current = text[index]!
  if (state.inString) {
    advanceString(state, current)
    return current
  }
  if (current === '"') state.inString = true
  if (current === "," && trailingComma(text, index)) return ""
  return current
}
const removeTrailingCommas = (text: string): string => {
  let output = ""
  const state: StringState = { inString: false, escaped: false }
  for (let index = 0; index < text.length; index++) output += scanTrailingCommaCharacter(state, text, index)
  return output
}

/** Reject ambiguous keys before JSON.parse applies last-write-wins behavior. */
const rejectDuplicateKeys = (text: string): void => {
  let index = 0
  const skipWhitespace = (): void => {
    while (/\s/.test(text[index] ?? "")) index++
  }
  const stringEnd = (): number => {
    const start = index++
    const state: StringState = { inString: true, escaped: false }
    while (index < text.length) {
      advanceString(state, text[index++]!)
      if (!state.inString) return index
    }
    throw new JsoncParseError(`unterminated string at offset ${start}`)
  }
  const objectKey = (keys: Set<string>): void => {
    skipWhitespace()
    if (text[index] !== '"') throw new JsoncParseError(`expected object key at offset ${index}`)
    const tokenStart = index
    const end = stringEnd()
    const decodedKey: unknown = JSON.parse(text.slice(tokenStart, end))
    if (typeof decodedKey !== "string") throw new JsoncParseError(`invalid object key at offset ${tokenStart}`)
    if (keys.has(decodedKey)) throw new JsoncParseError(`duplicate object key '${decodedKey}'`)
    keys.add(decodedKey)
  }
  const requirePunctuation = (character: string): void => {
    skipWhitespace()
    if (text[index] !== character) throw new JsoncParseError(`expected '${character}' at offset ${index}`)
    index++
  }
  const consumeEnd = (character: string): boolean => {
    skipWhitespace()
    if (text[index] !== character) return false
    index++
    return true
  }
  const parseObject = (): void => {
    index++
    const keys = new Set<string>()
    if (consumeEnd("}")) return
    while (index < text.length) {
      objectKey(keys)
      requirePunctuation(":")
      parseValue()
      if (consumeEnd("}")) return
      requirePunctuation(",")
    }
    throw new JsoncParseError("unterminated object")
  }
  const parseArray = (): void => {
    index++
    if (consumeEnd("]")) return
    while (index < text.length) {
      parseValue()
      if (consumeEnd("]")) return
      requirePunctuation(",")
    }
    throw new JsoncParseError("unterminated array")
  }
  const parsePrimitive = (): void => {
    while (index < text.length && !/[\s,}\]]/.test(text[index] ?? "")) index++
    if (index === 0) throw new JsoncParseError("expected JSON value")
  }
  const parseValue = (): void => {
    skipWhitespace()
    switch (text[index]) {
      case "{":
        parseObject()
        return
      case "[":
        parseArray()
        return
      case '"':
        index = stringEnd()
        return
      default:
        parsePrimitive()
    }
  }
  parseValue()
  skipWhitespace()
  if (index !== text.length) throw new JsoncParseError(`unexpected token at offset ${index}`)
}

export const parseJsonc = (text: string): unknown => {
  const withoutComments = stripComments(text)
  const normalized = removeTrailingCommas(withoutComments)
  rejectDuplicateKeys(normalized)
  try {
    return JSON.parse(normalized) as unknown
  } catch {
    throw new JsoncParseError("configuration is not valid JSONC")
  }
}
