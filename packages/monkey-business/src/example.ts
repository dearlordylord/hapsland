import { createRun } from "./index.ts"
const run = createRun()
run.subscribe((frame) =>
  console.log(`${frame.time}: ${frame.event.kind} → ${frame.commands.map((command) => command.kind).join(", ")}`)
)
console.log(run.advance({ maxEvents: 100 }))
