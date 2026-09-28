import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initialCanonical, projectCanonical, stepCanonical } from "../../../src/canonical/adapter.ts";

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-v1.json"), "utf8"));
const format = (commands) => commands.map((item) => {
  switch (item.kind) {
    case "prepare": case "unitAdmitted": return `${item.kind}:${item.operation}:${item.reservation}`;
    case "roundStarted": case "reservationReleased": return `${item.kind}:${item.id}`;
    case "preparationReleased": return `reservationReleased:${item.id}`;
    case "partitionRetired": return `${item.kind}:${item.round}`;
    case "writeAuthorized": case "cancelWork": return `${item.kind}:${item.operation}`;
    case "reviewRecorded": case "writeRecorded": return `${item.kind}:${item.outcome}`;
    default: return item.kind;
  }
}).join(",");
for (const trace of fixture.traces) {
  let state = initialCanonical(fixture.limits);
  const commands = [];
  const capacity = [];
  for (const event of trace.events) {
    const result = stepCanonical(state, event);
    state = result.state;
    commands.push(result.rejection ? `rejected:${result.rejection}` : format(result.commands));
    if (event.kind === "preparationCompleted") capacity.push(result.commands
      .filter((command) => "after" in command)
      .map((command) => ({ kind: command.kind, ...("position" in command ? { position: command.position, bytes: command.bytes } : {}),
        ...("reason" in command ? { reason: command.reason } : {}),
        global: command.after.global, local: command.after.local, charges: command.after.charges })));
  }
  assert.deepEqual(commands, trace.commands, trace.name);
  assert.deepEqual(projectCanonical(state).global, trace.global, `${trace.name}: ledger`);
  assert.deepEqual(projectCanonical(state).partitions, trace.partitions, `${trace.name}: advicee usage`);
  if (trace.charges) assert.deepEqual(projectCanonical(state).charges, trace.charges, `${trace.name}: reservations`);
  if (trace.capacity) assert.deepEqual(capacity, trace.capacity, `${trace.name}: ordered capacity decisions`);
  if (trace.expectedDecisionPending) {
    assert.equal(projectCanonical(state).rounds[0]?.deciding, true, `${trace.name}: decision fence`);
  }
}
const state = initialCanonical(fixture.limits);
assert.deepEqual(projectCanonical(state).inventory, [
  "observationDispatch", "preparation", "reviewUnit", "storedResult", "operationalNotice", "adviceRecheck",
].map((purpose) => ({ purpose, limits: fixture.limits })));
assert.throws(() => stepCanonical(state, { kind: "openRound", partition: -1, lifetime: 1 }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "openRound", partition: 1, lifetime: 1, extra: true }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "openRound", partition: 2 ** 48, lifetime: 1 }), TypeError);
assert.throws(() => initialCanonical({ ...fixture.limits, globalBytes: 2 ** 47 }), TypeError);
assert.throws(() => initialCanonical({ ...fixture.limits, globalItems: 257 }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "beginPreparation", partition: 1, lifetime: 1, round: 1, bytes: 2 ** 47 }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "preparationCompleted", partition: 1, lifetime: 1, round: 1, operation: 1, unitBytes: new Array(1025).fill(1) }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "reviewCompleted", partition: 1, lifetime: 1, round: 1, operation: 1, outcome: "unexpected" }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "reserveCapacity", partition: 1, bytes: 1, purpose: "unknown" }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "reserveCapacity", partition: 1, bytes: 2 ** 47, purpose: "preparation" }), TypeError);
assert.throws(() => stepCanonical(state, { kind: "resizeCapacity", reservation: 1, bytes: 1, purpose: "unknown" }), TypeError);
assert.throws(() => stepCanonical({ $: "Canonical.State" }, { kind: "openRound", partition: 1, lifetime: 1 }), TypeError);
let edge = initialCanonical({ globalItems: 2, globalBytes: 2 ** 47 - 1, partitionItems: 2, partitionBytes: 2 ** 47 - 1 });
edge = stepCanonical(edge, { kind: "openRound", partition: 1, lifetime: 1 }).state;
edge = stepCanonical(edge, { kind: "beginPreparation", partition: 1, lifetime: 1, round: 1, bytes: 1 }).state;
const nearLimit = stepCanonical(edge, { kind: "preparationCompleted", partition: 1, lifetime: 1, round: 1, operation: 1, unitBytes: [2 ** 47 - 1, 2 ** 47 - 1] });
assert.deepEqual(nearLimit.commands.map((command) => command.kind), ["preparationReleased", "unitAdmitted", "unitRefused"]);
assert.equal(projectCanonical(nearLimit.state).global.bytes, 2 ** 47 - 1);
const usageText = (usage) => `${usage.items}/${usage.bytes}`;
const capacityCommand = (command) => {
  const after = "after" in command ? `:${usageText(command.after.global)}:${usageText(command.after.local)}` : "";
  switch (command.kind) {
    case "capacityGranted": case "capacityResized": return `${command.kind}:${command.id}${after}`;
    case "preparationReleased": return `${command.kind}:${command.id}${after}`;
    case "capacityUnitAdmitted": return `${command.kind}:${command.position}:${command.reservation}${after}`;
    case "capacityUnitRefused": return `${command.kind}:${command.position}:${command.reason}${after}`;
    case "reservationReleased": return `${command.kind}:${command.id}`;
    default: throw new Error(`unexpected capacity trace command ${command.kind}`);
  }
};
let capacityState = initialCanonical(fixture.limits);
const capacityCommands = [];
for (const [index, event] of fixture.capacityTrace.events.entries()) {
  const result = stepCanonical(capacityState, event);
  capacityState = result.state;
  capacityCommands.push(result.rejection ? `rejected:${result.rejection}` :
    result.commands.map(capacityCommand).join(","));
  if (index === 7) assert.deepEqual(projectCanonical(capacityState).charges,
    fixture.capacityTrace.afterResizeCharges, "purpose change and competing ownership");
}
assert.deepEqual(capacityCommands, fixture.capacityTrace.commands, "resident capacity transition contract");
assert.deepEqual(projectCanonical(capacityState).global, fixture.capacityTrace.finalGlobal, "exact capacity release");
const permitFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-permits-v1.json"), "utf8"));
for (const trace of permitFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const item of trace.events) {
    const { expect: expected, kind, ...input } = item;
    const partition = input.partition;
    const lifetime = input.lifetime ?? 1;
    let event;
    if (kind === "issue") event = { kind: "issuePermit", partition, lifetime,
      tool: input.tool, started: input.started, now: input.now, deadline: input.deadline,
      facts: { clockValid: true, withinHookWindow: true, startedAfterClosure: input.afterClosure ?? true,
        duplicateEvent: false, permitCount: 0, permitLimit: 1024,
        roundCount: 0, roundLimit: 64, newRound: true, eventCount: 0, eventLimit: 4096 } };
    else if (kind === "consume") event = { kind: "consumePermit", partition, lifetime,
      token: input.token, tool: input.tool, now: input.now };
    else if (kind === "expire") event = { kind: "expirePermit", partition, lifetime,
      token: input.token, deadlineReached: input.due };
    else if (kind === "close") event = { kind: "closePermitRound", partition, lifetime,
      round: input.round, at: input.at, prospective: input.prospective };
    else throw new Error(`unknown permit fixture event ${kind}`);
    const result = stepCanonical(current, event);
    current = result.state;
    const actual = result.rejection ? `rejected:${result.rejection}` : result.commands.map((command) => {
      if (command.kind === "permitIssued") return `permitIssued:${command.token}:${command.round}`;
      if (command.kind === "permitConsumed" || command.kind === "permitRoundClosed") return `${command.kind}:${command.round}`;
      return command.kind;
    }).join(",");
    assert.equal(actual, expected, `${trace.name}: ${kind}`);
  }
  assert.deepEqual(projectCanonical(current).admissions.map((entry) => ({
    partition: entry.partition, round: entry.round, active: entry.active,
    permits: entry.permits.length, used: entry.used.length,
  })), trace.rounds, trace.name);
}
const reviewFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-review-v1.json"), "utf8"));
for (const trace of reviewFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const item of trace.events) {
    const { expect: expected, afterChargePurpose, afterWorkKind, afterParents, ...event } = item;
    const result = stepCanonical(current, event);
    current = result.state;
    const actual = result.rejection ? `rejected:${result.rejection}` : result.commands.map((command) => {
      if (command.kind === "roundStarted" || command.kind === "observationAdmitted" ||
          command.kind === "preparationReleased" || command.kind === "reservationReleased") {
        return `${command.kind}:${command.id}`;
      }
      if (command.kind === "prepare" || command.kind === "unitAdmitted") {
        return `${command.kind}:${command.operation}:${command.reservation}`;
      }
      if (command.kind === "reviewRecorded") return `${command.kind}:${command.outcome}`;
      if (command.kind === "partitionRetired") return `${command.kind}:${command.round}`;
      return command.kind;
    }).join(",");
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`);
    if (afterChargePurpose !== undefined) {
      assert.equal(projectCanonical(current).charges[0]?.purpose, afterChargePurpose,
        `${trace.name}: retained result charge`);
    }
    if (afterWorkKind !== undefined) {
      assert.equal(projectCanonical(current).work.find((work) => work.operation === event.operation)?.kind, afterWorkKind,
        `${trace.name}: completed result stage`);
    }
    if (afterParents !== undefined) {
      assert.deepEqual(projectCanonical(current).work.filter((work) => work.kind === "reviewing")
        .map((work) => work.parent), afterParents, `${trace.name}: exact unit parent identities`);
    }
  }
  assert.deepEqual(projectCanonical(current).work, trace.finalWork, `${trace.name}: work`);
  assert.deepEqual(projectCanonical(current).charges, trace.finalCharges, `${trace.name}: charges`);
}
const dispatchFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-dispatch-v1.json"), "utf8"));
for (const trace of dispatchFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event);
    current = result.state;
    const actual = result.rejection ? `rejected:${result.rejection}` : result.commands.map((command) => {
      if (command.kind === "roundStarted" || command.kind === "observationAdmitted") return `${command.kind}:${command.id}`;
      if (command.kind === "dispatchStarted") return `${command.kind}:${command.operation}:${command.sequence}:${command.cycle}`;
      if (command.kind === "dispatchCycleCompleted") return `${command.kind}:${command.cycle}`;
      if (command.kind === "dispatchDiscarded") return `${command.kind}:${command.operation}:${command.running}`;
      throw new Error(`unexpected dispatch trace command ${command.kind}`);
    }).join(",");
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`);
  }
  const { pending, active, running, nextSequence, cycle, closed } = projectCanonical(current).dispatch;
  assert.deepEqual({ pending, active, running, nextSequence, cycle, closed }, trace.dispatch, trace.name);
}
const stopFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-stop-v1.json"), "utf8"));
for (const trace of stopFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event);
    current = result.state;
    const actual = result.rejection ? `rejected:${result.rejection}` : result.commands.map((command) => {
      if (command.kind === "roundStarted" || command.kind === "observationAdmitted" || command.kind === "reservationReleased") return `${command.kind}:${command.id}`;
      if (command.kind === "preparationReleased") return `${command.kind}:${command.id}`;
      if (command.kind === "prepare" || command.kind === "unitAdmitted") return `${command.kind}:${command.operation}:${command.reservation}`;
      if (command.kind === "dispatchStarted" || command.kind === "cancelWork") return `${command.kind}:${command.operation}`;
      if (command.kind === "dispatchCycleCompleted") return `${command.kind}:${command.cycle}`;
      return command.kind;
    }).join(",");
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`);
  }
}
const collectionFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-collection-v1.json"), "utf8"));
for (const trace of collectionFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event);
    current = result.state;
    const actual = result.rejection ? `rejected:${result.rejection}` : result.commands.map((command) => command.kind).join(",");
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`);
  }
  assert.deepEqual(projectCanonical(current).collection, trace.collection, trace.name);
}
const deliveryFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-delivery-v1.json"), "utf8"));
for (const trace of deliveryFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event);
    current = result.state;
    const actual = result.rejection ? `rejected:${result.rejection}` : result.commands.map((command) =>
      command.kind === "finishRecorded" ? `${command.kind}:${command.outcome}` : command.kind).join(",");
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`);
  }
  const { slots, counters, submissions } = projectCanonical(current).delivery;
  assert.deepEqual({ slots, counters }, trace.delivery, trace.name);
  if (trace.submissions) assert.deepEqual(submissions, trace.submissions, trace.name);
}
const submissionFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-submission-v1.json"), "utf8"));
for (const trace of submissionFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const { expect: expected, afterBatches, afterLeases, ...event } of trace.events) {
    const result = stepCanonical(current, event);
    current = result.state;
    assert.equal(result.rejection ?? result.commands[0]?.kind, expected,
      `${trace.name}: ${event.kind}`);
    const submission = projectCanonical(current).delivery.submissions;
    if (afterBatches) assert.deepEqual(submission.batches.map((batch) => batch.phase), afterBatches, `${trace.name}: batch phase`);
    if (afterLeases) assert.deepEqual(submission.leases.map((lease) => `${lease.phase}:${lease.reoffered}`), afterLeases, `${trace.name}: lease phase`);
  }
  assert.deepEqual(projectCanonical(current).delivery.submissions, trace.submissions, trace.name);
}
const revisionFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-revision-v1.json"), "utf8"));
for (const trace of revisionFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event);
    current = result.state;
    const actual = result.rejection ? `rejected:${result.rejection}` : result.commands.map((command) => {
      if ("generation" in command) return `${command.kind}:${command.generation}`;
      if (command.kind === "revisionCount") return `${command.kind}:${command.count}`;
      return command.kind;
    }).join(",");
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`);
  }
  assert.deepEqual(projectCanonical(current).revision, trace.revision, trace.name);
}
const ticketFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-ticket-v1.json"), "utf8"));
for (const trace of ticketFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event);
    current = result.state;
    const actual = result.rejection ? `rejected:${result.rejection}` : result.commands.map((command) =>
      command.kind === "ticketUnitSnapshot" ? `${command.kind}:${command.stage}${command.delivered ? ":delivered" : ""}${command.reason ? `:${command.reason}` : ""}` :
        "reason" in command ? `${command.kind}:${command.reason}` : command.kind).join(",");
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`);
  }
  assert.deepEqual(projectCanonical(current).tickets, trace.tickets, trace.name);
}
const reuseFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-reuse-v1.json"), "utf8"));
for (const trace of reuseFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event);
    current = result.state;
    const actual = result.rejection ? `rejected:${result.rejection}` : result.commands.map((command) =>
      command.kind === "cachePrepared" ? `${command.kind}:${command.evicted.join(",")}` :
        command.kind === "cacheDiscarded" ? `${command.kind}:${command.ids.join(",")}` :
          command.kind === "capacityGranted" || command.kind === "reservationReleased"
            ? `${command.kind}:${command.id}` : command.kind).join(",");
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`);
  }
  assert.deepEqual(projectCanonical(current).reuse, trace.reuse, trace.name);
}
const noticeFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-notice-v1.json"), "utf8"));
for (const trace of noticeFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event);
    current = result.state;
    const actual = result.rejection ? `rejected:${result.rejection}` : result.commands.map((command) => {
      switch (command.kind) {
        case "capacityGranted": case "reservationReleased": return `${command.kind}:${command.id}`;
        case "noticeSuppressed": case "noticeCreatePending": case "noticeMergePending": return `${command.kind}:${command.count}`;
        case "noticeSelected": return `${command.kind}:${command.ids.join(",")}`;
        case "noticePruned": return `${command.kind}:${command.dropLease}:${command.dropPending}:${command.dropKey}`;
        default: return command.kind;
      }
    }).join(",");
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`);
  }
  assert.deepEqual(projectCanonical(current).notices, trace.notices, trace.name);
}
const retentionFixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-retention-v1.json"), "utf8"));
for (const trace of retentionFixture.traces) {
  let current = initialCanonical(fixture.limits);
  for (const { expect: expected, ...event } of trace.events) {
    const result = stepCanonical(current, event);
    current = result.state;
    const actual = result.rejection ? `rejected:${result.rejection}` : result.commands.map((command) => {
      switch (command.kind) {
        case "ticketEvicted": case "capacityGranted": case "reservationReleased": case "roundStarted":
          return `${command.kind}:${command.id}`;
        case "prepare": return `${command.kind}:${command.operation}:${command.reservation}`;
        default: return command.kind;
      }
    }).join(",");
    assert.equal(actual, expected, `${trace.name}: ${event.kind}`);
  }
  const projection = projectCanonical(current);
  assert.deepEqual(projection.tickets, trace.tickets, trace.name);
  assert.equal(projection.dispatch.closed, trace.closed, trace.name);
  if (trace.rounds) assert.deepEqual(projection.rounds.map((round) => round.id).sort((a, b) => a - b), trace.rounds, trace.name);
}
console.log(`checked ${fixture.traces.length + permitFixture.traces.length + reviewFixture.traces.length + dispatchFixture.traces.length + stopFixture.traces.length + collectionFixture.traces.length + deliveryFixture.traces.length + submissionFixture.traces.length + revisionFixture.traces.length + ticketFixture.traces.length + reuseFixture.traces.length + noticeFixture.traces.length + retentionFixture.traces.length} independent source-free canonical traces`);
