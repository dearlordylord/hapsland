import assert from "node:assert/strict"
import { createServiceRegistry } from "./service-session.ts"

let cases = 0
for (const mode of ["success", "register", "task-close", "task-remove", "close-remove"]) {
  for (const ordinary of [false, true]) {
    const registry = createServiceRegistry()
    const order = []
    const session = {
      invocation: 1,
      close() {
        order.push("close")
        if (mode.endsWith("remove")) registry.remove(session)
        if (mode.includes("close")) throw undefined
      }
    }
    if (mode === "register") registry.register(session)
    const task = () => {
      order.push("task")
      if (mode.startsWith("task")) throw undefined
      return undefined
    }
    if (ordinary) {
      const observed = await registry.run(session, task).then(
        (value) => ({ status: "success", value }),
        (error) => ({ status: "failure", error })
      )
      assert.equal(observed.status, mode === "success" ? "success" : "failure")
      if (mode === "register") assert.match(observed.error.message, /duplicate active/)
      else if (mode.endsWith("remove")) assert.match(observed.error.message, /wrong registry owner/)
      else assert.equal(observed.error, undefined)
    } else {
      const result = await registry.runOutcome(session, task)
      const phases = {
        success: [],
        register: ["register"],
        "task-close": ["task", "close"],
        "task-remove": ["task", "remove"],
        "close-remove": ["close", "remove"]
      }[mode]
      assert.deepEqual(
        result.failures.map((receipt) => receipt.phase),
        phases
      )
      assert.equal(new Set(result.failures).size, phases.length)
      assert.equal(result.rejection, result.failures.at(-1))
      assert.equal(
        result.task.status,
        mode === "register" ? "not-started" : mode.startsWith("task") ? "failure" : "success"
      )
      if (result.task.status === "success") assert.equal(result.task.value, undefined)
      if (result.task.status === "failure") assert.equal(result.task.receipt, result.failures[0])
      for (const receipt of result.failures)
        if (["task", "close"].includes(receipt.phase)) assert.equal(receipt.error, undefined)
    }
    assert.deepEqual(order, mode === "register" ? [] : ["task", "close"])
    assert.equal(registry.size, mode === "register" ? 1 : 0)
    cases++
  }
}
console.log(
  JSON.stringify({
    passed: true,
    cases,
    scope:
      "Actual registry task/finalizer occurrences, raw failure values, operation order and ordinary run rejection; whole driver receipt composition remains open"
  })
)
