import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
const temp = await mkdtemp("/tmp/hapsland-source-cursor-")
try {
  const emitted = join(temp, "cursor.mjs")
  execFileSync(
    "taskset",
    [
      "-c",
      "10",
      "bend",
      join(
        import.meta.dirname,
        "../../../packages/resident-runtime/src/resident/review-work/preparation/SourcePreparation.bend"
      ),
      "-o",
      emitted
    ],
    { timeout: 5000 }
  )
  const core = (await import(pathToFileURL(emitted))).default
  const list = (items) => items.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
  const recover = (initial) => {
    let step = initial
    const commands = []
    while (step.$ === "Await") {
      const request = step.request
      commands.push(request.command.$)
      const response = request.command.$ === "ReadRuntimeActive" ? { $: "Active", value: true } : { $: "Ack" }
      assert.equal(
        core.resume(step, { $: "Reply", invocation: request.invocation, id: request.id + 1n, response }).$,
        "Rejected"
      )
      step = core.resume(step, { $: "Reply", invocation: request.invocation, id: request.id, response })
    }
    assert.deepEqual(commands, [
      "RecordPreparationFailureAnalytics",
      "ReleaseJobReservation",
      "ReadRuntimeActive",
      "RecordUnavailableActivity"
    ])
    return step
  }
  let cases = 0
  for (const bound of [false, true])
    for (const candidates of [[], [11n], [11n, 22n], [11n, 11n]]) {
      let step = core.initial_after_gates(7n, bound, list(candidates))
      const commands = []
      const reply = (response) => {
        const request = step.request
        step = core.resume(step, { $: "Reply", invocation: request.invocation, id: request.id, response })
      }
      while (step.$ === "Await") {
        const { request } = step
        assert.deepEqual(
          core.resume(step, {
            $: "Reply",
            invocation: 7n,
            id: request.id,
            response: { $: "Defect", token: 94n, interrupted: true, recoverable: false }
          }),
          { $: "Stopped", completed: request.command.$ === "AfterPrepare", reason: { $: "DefectFailure", token: 94n } }
        )
        assert.equal(
          core.resume(step, { $: "Reply", invocation: 8n, id: request.id, response: { $: "Ack" } }).$,
          "Rejected"
        )
        assert.equal(
          core.resume(step, { $: "Reply", invocation: 7n, id: request.id + 1n, response: { $: "Ack" } }).$,
          "Rejected"
        )
        commands.push(request.command)
        if (request.command.$ === "CheckCandidateActive") {
          assert.deepEqual(
            core.resume(step, { $: "Reply", invocation: 7n, id: request.id, response: { $: "Active", value: false } }),
            { $: "Stopped", completed: false, reason: { $: "CandidateStopped" } }
          )
          reply({ $: "Active", value: true })
        } else if (request.command.$ === "AdmitCandidateWorkspace")
          reply({ $: "WorkspaceAdmitted", preparation: request.id + 100n })
        else if (request.command.$ === "ReadExpectedActivity")
          reply({ $: "ExpectedActivity", identities: list(candidates) })
        else if (request.command.$ === "PrepareCandidate") {
          assert.equal(
            core.resume(step, { $: "Reply", invocation: 7n, id: request.id, response: { $: "Ack" } }).$,
            "Rejected"
          )
          const refusal = core.resume(step, {
            $: "Reply",
            invocation: 7n,
            id: request.id,
            response: { $: "CandidateContinued", value: false }
          })
          assert.deepEqual(refusal, { $: "Stopped", completed: false, reason: { $: "CandidateStopped" } })
          reply({ $: "CandidateContinued", value: true })
        } else if (["CompletePolicySource", "CompleteObservation"].includes(request.command.$)) {
          const refusal = core.resume(step, {
            $: "Reply",
            invocation: 7n,
            id: request.id,
            response: { $: "CompletionAccepted", value: false }
          })
          assert.equal(recover(refusal).completed, false)
          if (request.command.$ === "CompleteObservation")
            assert.deepEqual(
              core.resume(step, {
                $: "Reply",
                invocation: 7n,
                id: request.id,
                response: { $: "ObservationCommittedCancelled", token: 96n }
              }),
              { $: "Stopped", completed: true, reason: { $: "InvocationCancelled", token: 96n } }
            )
          if (request.command.$ === "CompleteObservation")
            assert.deepEqual(
              core.resume(step, {
                $: "Reply",
                invocation: 7n,
                id: request.id,
                response: { $: "ObservationCommittedDefect", token: 95n, recoverable: false }
              }),
              { $: "Stopped", completed: true, reason: { $: "DefectFailure", token: 95n } }
            )
          if (request.command.$ === "CompleteObservation")
            assert.deepEqual(
              recover(
                core.resume(step, {
                  $: "Reply",
                  invocation: 7n,
                  id: request.id,
                  response: { $: "ObservationCommittedFailure", token: 93n }
                })
              ),
              { $: "Stopped", completed: true, reason: { $: "TechnicalFailure", token: 93n } }
            )
          reply({ $: "CompletionAccepted", value: true })
        } else {
          const failed = recover(
            core.resume(step, { $: "Reply", invocation: 7n, id: request.id, response: { $: "Failed", token: 91n } })
          )
          assert.equal(failed.completed, request.command.$ === "AfterPrepare")
          assert.deepEqual(failed.reason, { $: "TechnicalFailure", token: 91n })
          const cancelled = core.resume(step, {
            $: "Reply",
            invocation: 7n,
            id: request.id,
            response: { $: "Cancelled", token: 92n }
          })
          assert.equal(cancelled.completed, request.command.$ === "AfterPrepare")
          reply({ $: "Ack" })
        }
      }
      assert.equal(step.$, "Finished")
      assert.deepEqual(
        commands.filter((command) => command.$ === "PrepareCandidate").map((command) => command.candidate),
        candidates
      )
      assert.deepEqual(
        commands.slice(candidates.length * 3).map((command) => command.$),
        [
          "ReadExpectedActivity",
          ...(candidates.length ? ["RecordPendingActivity"] : []),
          ...(bound ? ["CompletePolicySource"] : []),
          "CompleteObservation",
          "AfterPrepare"
        ]
      )
      assert.equal(core.resume(step, { $: "Reply", invocation: 7n, id: 0n, response: { $: "Ack" } }).$, "Rejected")
      cases++
    }
  for (const [reason, diagnostic, extra] of [
    [{ $: "CapacityRefused" }, { $: "WorkspaceCapacity", requested_bytes: 128n }, ["RejectCandidateCapacity"]],
    [{ $: "Unavailable", reason: { $: "StaleRound" } }, { $: "WorkspaceUnavailable", reason: { $: "StaleRound" } }, []],
    [{ $: "Unavailable", reason: { $: "WrongStage" } }, { $: "WorkspaceUnavailable", reason: { $: "WrongStage" } }, []],
    [{ $: "InvalidMeasurement" }, { $: "WorkspacePanic" }, []]
  ]) {
    let step = core.initial_after_gates(7n, true, list([11n, 22n]))
    const reply = (response) => {
      step = core.resume(step, { $: "Reply", invocation: 7n, id: step.request.id, response })
    }
    reply({ $: "Active", value: true })
    reply({ $: "WorkspaceRefused", reason, requested_bytes: 128n })
    assert.deepEqual(step.request.command, { $: "ObserveCandidateDiagnostic", candidate: 11n, diagnostic })
    const commands = []
    while (step.$ === "Await" && step.request.command.$ !== "CheckCandidateActive") {
      commands.push(step.request.command.$)
      assert.deepEqual(
        recover(
          core.resume(step, { $: "Reply", invocation: 7n, id: step.request.id, response: { $: "Failed", token: 91n } })
        ),
        { $: "Stopped", completed: false, reason: { $: "TechnicalFailure", token: 91n } }
      )
      reply({ $: "Ack" })
    }
    assert.deepEqual(commands, [
      "ObserveCandidateDiagnostic",
      ...extra,
      "RecordCandidateAnalytics",
      "RecordCandidateUnavailable"
    ])
    assert.equal(step.request.command.candidate, 22n)
    cases++
  }
  for (const response of [
    { $: "Failed", token: 101n },
    { $: "Defect", token: 102n, interrupted: false, recoverable: false },
    { $: "Cancelled", token: 103n }
  ]) {
    let step = core.initial_after_gates(7n, true, list([11n]))
    step = core.resume(step, {
      $: "Reply",
      invocation: 7n,
      id: step.request.id,
      response: { $: "Failed", token: 100n }
    })
    const stopped = core.resume(step, { $: "Reply", invocation: 7n, id: step.request.id, response })
    assert.equal(stopped.$, "Stopped")
    assert.equal(stopped.reason.token, response.token)
    cases++
  }
  const panicOnce = (step) => {
    const request = step.request
    const panic = core.resume(step, {
      $: "Reply",
      invocation: request.invocation,
      id: request.id,
      response: { $: "Defect", token: 110n, interrupted: false, recoverable: false }
    })
    assert.equal(panic.$, "Await")
    assert.deepEqual(panic.request.command, {
      $: "ObserveCandidateDiagnostic",
      candidate: 11n,
      diagnostic: { $: "WorkspacePanic" }
    })
    assert.deepEqual(
      core.resume(panic, {
        $: "Reply",
        invocation: panic.request.invocation,
        id: panic.request.id,
        response: { $: "Defect", token: 111n, interrupted: false, recoverable: false }
      }),
      { $: "Stopped", completed: false, reason: { $: "DefectFailure", token: 111n } }
    )
    assert.deepEqual(
      core.resume(panic, {
        $: "Reply",
        invocation: panic.request.invocation,
        id: panic.request.id,
        response: { $: "Ack" }
      }),
      { $: "Stopped", completed: false, reason: { $: "DefectFailure", token: 110n } }
    )
    cases++
  }
  let boundary = core.initial_after_gates(7n, true, list([11n, 22n]))
  panicOnce(boundary)
  boundary = core.resume(boundary, {
    $: "Reply",
    invocation: 7n,
    id: boundary.request.id,
    response: { $: "Active", value: true }
  })
  panicOnce(boundary)
  boundary = core.resume(boundary, {
    $: "Reply",
    invocation: 7n,
    id: boundary.request.id,
    response: { $: "WorkspaceRefused", reason: { $: "CapacityRefused" }, requested_bytes: 128n }
  })
  for (let index = 0; index < 4; index++) {
    panicOnce(boundary)
    boundary = core.resume(boundary, { $: "Reply", invocation: 7n, id: boundary.request.id, response: { $: "Ack" } })
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      scope:
        "emitted source cursor finite protocol/order checks; repeated handles denote distinct ordered positions; atomic completion custody, real child composition and production adoption remain open"
    })
  )
} finally {
  await rm(temp, { recursive: true, force: true })
}
