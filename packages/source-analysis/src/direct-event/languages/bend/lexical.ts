// Lexical isolation only: source syntax is assumed valid. Literal contents
// cannot introduce bindings; literal syntax within a datatype remains unsupported.
const lexicalTokens = /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|#[^\r\n]*/g
export const maskBendSource = (source: string, boundaries: boolean): string =>
  source.replace(lexicalTokens, (token) => {
    const masked = token.replace(/[^\r\n]/g, " ")
    return boundaries || token.startsWith("#") ? masked : `?${masked.slice(1, -1)}?`
  })
