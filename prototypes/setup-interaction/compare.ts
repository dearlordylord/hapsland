import assert from "node:assert/strict"
import { initial, type Event, type Model } from "./domain.ts"
import { calls } from "./fake.ts"
import { withMachine } from "./machine.ts"
import { reduce } from "./reducer.ts"
import { runScenarios, type Dispatch } from "./scenarios.ts"
const reports: object[] = []
async function scenario(name: string, source: string, drive: (dispatch: Dispatch, start: Model) => Promise<Model>) {
  const expected: Model[] = []
  let local = initial(source)
  const reducerResult = await drive(async (event) => {
    local = reduce(local, event)
    expected.push(local)
    return local
  }, local)
  let offset = 0
  const machineResult = await withMachine(initial(source), async (send) =>
    drive(async (event) => {
      const actual = await send(event)
      assert.deepEqual(actual, expected[offset++], `${name}: transition ${offset}`)
      return actual
    }, initial(source))
  )
  assert.equal(offset, expected.length)
  assert.deepEqual(machineResult, reducerResult)
  assert(!JSON.stringify(expected).includes("SYNTHETIC_ONLY_DO_NOT_LOG"))
  reports.push({ name, transitions: offset, result: reducerResult })
}
await runScenarios(scenario)

console.log(
  JSON.stringify(
    {
      runtime: Bun.version,
      scenarios: reports,
      syntheticCommands: calls.length,
      providerRequests: 0,
      storageWrites: 0
    },
    null,
    2
  )
)
