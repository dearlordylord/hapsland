const same = (left, right) => left?.source === right.source && left?.output === right.output
const pause = (ms, signal) =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener("abort", done, { once: true })
  })
/** Serial builds; failures wait for changed inputs, and drift never becomes ready. */
export async function runBuildWatch({ observe, build, status, signal, deadline, intervalMs = 500 }) {
  if (!Number.isSafeInteger(deadline) || deadline <= Date.now() || !Number.isSafeInteger(intervalMs) || intervalMs <= 0)
    throw new Error("Build watch requires finite positive budgets")
  let attempted
  try {
    while (!signal.aborted && Date.now() < deadline) {
      let before
      try {
        before = await observe()
      } catch (error) {
        attempted = undefined
        await status({ state: "failed", error: error.message })
        await pause(Math.min(intervalMs, Math.max(1, deadline - Date.now())), signal)
        continue
      }
      if (signal.aborted || Date.now() >= deadline) break
      if (!same(attempted, before)) {
        await status({ state: "building", source: before.source })
        try {
          await build()
          const after = await observe()
          if (after.source !== before.source) {
            attempted = undefined
            await status({ state: "drift", source: after.source })
            continue
          }
          attempted = after
          await status({ state: "ready", source: after.source, output: after.output })
        } catch (error) {
          let after
          try {
            after = await observe()
          } catch {
            after = undefined
          }
          attempted = after?.source === before.source ? after : undefined
          await status({ state: "failed", source: after?.source, error: error.message })
        }
      }
      await pause(Math.min(intervalMs, Math.max(1, deadline - Date.now())), signal)
    }
  } finally {
    await status({ state: "stopped" })
  }
}
