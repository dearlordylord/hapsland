import * as Effect from "effect/Effect"

// Only fixture IO doubles yield promises. The shared native algorithms retain their actual Effect.fn execution.
export const referenceIo =
  (run) =>
  (...args) =>
    Effect.promise(async () => {
      const generator = run(...args)
      let step = generator.next()
      while (!step.done) {
        let value
        try {
          value = await step.value
        } catch (error) {
          step = generator.throw(error)
          continue
        }
        step = generator.next(value)
      }
      return step.value
    })
