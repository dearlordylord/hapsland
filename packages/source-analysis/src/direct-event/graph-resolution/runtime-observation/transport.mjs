export class TransportFailure extends Error {
  constructor(code) {
    super("Bend effect transport: " + code)
    this.code = code
  }
}
const abortFailure = () => new TransportFailure("aborted")
const checkAbort = (signal) => {
  if (signal?.aborted) throw abortFailure()
}

function waitForReply(operation, signal) {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (callback, value) => {
      if (settled) return
      settled = true
      signal?.removeEventListener("abort", onAbort)
      callback(value)
    }
    const onAbort = () => settle(reject, abortFailure())
    signal?.addEventListener("abort", onAbort, { once: true })
    if (signal?.aborted) onAbort()
    // Attach both callbacks even after cancellation: late failures stay observed.
    operation.then(
      (value) => settle(resolve, value),
      () => settle(reject, new TransportFailure("handler-rejected"))
    )
  })
}

export function createDispatcher(start, handlers) {
  const table = Object.freeze(Object.assign(Object.create(null), handlers))
  for (const handler of Object.values(table))
    if (typeof handler !== "function") throw new TransportFailure("invalid-handler")
  return async function run(args, { signal } = {}) {
    checkAbort(signal)
    let operation = start(...args)
    for (;;) {
      checkAbort(signal)
      if (
        operation === null ||
        typeof operation !== "object" ||
        !Object.hasOwn(operation, "$") ||
        typeof operation.$ !== "string"
      )
        throw new TransportFailure("invalid-operation")
      if (operation.$ === "Emit") {
        if (!Object.hasOwn(operation, "value")) throw new TransportFailure("invalid-emit")
        return operation.value
      }
      if (operation.$ === "Halt") throw new TransportFailure("halt")
      if (
        !Object.hasOwn(table, operation.$) ||
        !Object.hasOwn(operation, "args") ||
        !Object.hasOwn(operation, "kont") ||
        !Array.isArray(operation.args) ||
        typeof operation.kont !== "function"
      )
        throw new TransportFailure("unsupported-effect")
      const current = operation
      const request = Promise.resolve().then(() => {
        checkAbort(signal)
        return table[current.$](...current.args, { signal })
      })
      let reply
      if (signal !== undefined) reply = await waitForReply(request, signal)
      else {
        // Keep handler dispatch queued. Without a signal, the extra abort-race
        // Promise has no owner and is unnecessary. Continuation errors remain
        // outside this handler-only rejection mapping.
        try {
          reply = await request
        } catch {
          throw new TransportFailure("handler-rejected")
        }
      }
      checkAbort(signal)
      operation = current.kont(reply)
    }
  }
}

export function embedProgram(source) {
  const footer = "\ncli(process.argv.slice(1));\nio_exit($main$, null);"
  if (
    !source.endsWith(footer) ||
    !source.includes("function $resolve_probe$(_source_0, _configured_0) {") ||
    !source.includes("const $0eff = Object.create(null);")
  )
    throw new TransportFailure("unknown-runtime-layout")
  const effects = [...source.matchAll(/io_eff\("([^"]+)",/g)].map((match) => match[1])
  if (effects.length !== 1 || effects[0] !== "Runtime.parser_request")
    throw new TransportFailure("unexpected-effect-registry")
  const body = source.slice(0, -footer.length)
  return (
    body +
    `\nexport const start=(source,configured)=>run_loop($resolve_probe$(source,configured)(value=>({$: 'Emit',value})));
export const startMany=(fuel,source,configured)=>run_loop($resolve_steps$(fuel,source,configured)(value=>({$: 'Emit',value})));
if(Object.keys($0eff).length!==1 || !Object.hasOwn($0eff,'Runtime.parser_request')) throw new Error('unexpected effect registry');
export const handlers=Object.freeze({'Runtime.parser_request':$0eff['Runtime.parser_request']});\n`
  )
}
