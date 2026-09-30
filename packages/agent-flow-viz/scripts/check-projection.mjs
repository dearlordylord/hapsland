import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { inertHtml } from "foldkit/html";
import { Scene } from "foldkit/test";

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-v1.json"), "utf8"));
const usageText = (usage) => `${usage.items}/${usage.bytes}`;
const capacityCommand = (command) => {
  const after = "after" in command ? `:${usageText(command.after.global)}:${usageText(command.after.local)}` : "";
  switch (command.kind) {
    case "capacityGranted": case "capacityResized": case "preparationReleased":
      return `${command.kind}:${command.id}${after}`;
    case "capacityUnitAdmitted": return `${command.kind}:${command.position}:${command.reservation}${after}`;
    case "capacityUnitRefused": return `${command.kind}:${command.position}:${command.reason}${after}`;
    case "reservationReleased": return `${command.kind}:${command.id}`;
    default: throw new Error(`unexpected capacity command ${command.kind}`);
  }
};
const canonicalCommand = (command) => {
  switch (command.kind) {
    case "prepare": case "unitAdmitted": return `${command.kind}:${command.operation}:${command.reservation}`;
    case "roundStarted": case "reservationReleased": return `${command.kind}:${command.id}`;
    case "preparationReleased": return `reservationReleased:${command.id}`;
    case "partitionRetired": return `${command.kind}:${command.round}`;
    case "writeAuthorized": case "cancelWork": return `${command.kind}:${command.operation}`;
    case "reviewRecorded": case "writeRecorded": return `${command.kind}:${command.outcome}`;
    default: return command.kind;
  }
};
const expectedCommand = (step, formatter) => step.rejection
  ? `rejected:${step.rejection}` : step.commands.map(formatter).join(",");
const capacityFrame = (command) => ({ kind: command.kind,
  ...( "position" in command ? { position: command.position, bytes: command.bytes } : {}),
  ...( "reason" in command ? { reason: command.reason } : {}),
  global: command.after.global, local: command.after.local, charges: command.after.charges });
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const main = await server.ssrLoadModule("/src/production-main.ts");
  const canonical = await server.ssrLoadModule("/src/canonical-replay.ts");
  const inventory = await server.ssrLoadModule("/src/capacity-inventory.generated.ts");
  const imports = await server.ssrLoadModule("/src/import-graph-view.ts");
  const timeline = await server.ssrLoadModule("/src/timeline.ts");
  const send = (model, message) => main.update(model, message).model;
  const text = (model) => {
    const read = (node) => typeof node === "string" ? node : node == null ? "" :
      [node.text ?? "", ...(node.children ?? []).map(read)].join(" ");
    return read(main.view(model, inertHtml).body);
  };
  const initial = main.init().model;
  for (const source of ["src/entry.ts", "src/production-main.ts", "src/canonical-replay.ts"]) {
    const text = readFileSync(resolve(import.meta.dirname, "..", source), "utf8");
    assert.doesNotMatch(text, /from\s+["'][^"']*\.generated\.js["']/,
      `${source} must use the checked adapter, not a generated JavaScript import`);
  }
  const compiled = canonical.projectCanonical(canonical.initialCanonical(fixture.limits));
  const presentation = await server.ssrLoadModule("/src/production-flow-presentation.ts");
  const flowView = await server.ssrLoadModule("/src/production-flow-view.ts");
  const driver = await server.ssrLoadModule(`/@fs${resolve(import.meta.dirname, "../../monkey-business/src/index.ts")}`);
  for (const square of Object.values(presentation.SQUARES)) for (const facet of square.facets(compiled)) {
    assert.equal(facet.count, 0, "initial checked records have explicit zero facets");
    for (const count of [0, 1, 100]) {
      // Presentation fixtures exercise magnitude formatting, not admission or capacity claims.
      const row = presentation.squareFacetLine({ ...facet, count, references: Array.from({ length: count }, (_, index) => `#${Number.MAX_SAFE_INTEGER - index}`) });
      assert.ok(row.startsWith(`${count} `));
      if (count === 0) assert.doesNotMatch(row, /none|#|more/);
      assert.ok(row.length <= 28, "identity samples cannot crowd out exact facet counts");
    }
  }
  for (const count of [1, 50, 100]) {
    const run = driver.createRun({ outcome: "clear", session: { editIntervalMs: 1000000 } });
    run.applyControl({ kind: "burst", count });
    let observed;
    for (let step = 0; step < 1000; step++) {
      const frame = run.step(0);
      if (!frame) break;
      assert.equal(frame.rejection, undefined);
      if (frame.after.work.filter((work) => work.kind === "sourceQueued").length === count) { observed = frame.after; break; }
    }
    assert.ok(observed, `checked burst reaches ${count} queued sources`);
    const facet = presentation.SQUARES.sourcePending.facets(observed).find((item) => item.label === "source work waiting");
    assert.equal(facet.count, count);
    assert.match(JSON.stringify(flowView.productionFlowView(inertHtml, observed, undefined, false)), new RegExp(`${count} source work waiting`));
    assert.equal(presentation.SQUARES.preparation.facets(observed)[0].count, observed.dispatch.running.filter((entry) => entry.preparation).length);
    assert.equal(presentation.SQUARES.units.facets(observed)[2].count, observed.dispatch.running.filter((entry) => !entry.preparation).length);
  }
  assert.deepEqual(inventory.CAPACITY_INVENTORY.map((entry) => entry.purpose),
    compiled.inventory.map((entry) => entry.purpose));
  assert.deepEqual(inventory.CAPACITY_INVENTORY.map((entry) => entry.limits),
    compiled.inventory.map((entry) => Object.keys(entry.limits)));
  assert.match(text(initial), /From agent edit to Jev and back/);
  assert.match(text(initial), /Capacity rules/);
  assert.match(text(initial), /Jev request attempt/);
  assert.match(text(initial), /Awaiting Jev result/);
  const descendants = (node) => node == null ? [] : [node, ...(node.children ?? []).flatMap(descendants)];
  const elements = (model, name) => descendants(main.view(model, inertHtml).body)
    .filter((node) => node.data?.class?.[name]);
  const labels = (node) => descendants(node).map((child) => child.text ?? "").join(" ");
  assert.equal(elements(initial, "topology-node").length, 14);
  assert.equal(elements(initial, "topology-route").length, 24);
  assert.equal(elements(initial, "topology-route").filter((node) => node.data.class.active).length, 0);
  assert.equal(canonical.CANONICAL_SCENARIOS[initial.scenario].name, canonical.SHOWCASE_SCENARIO.name);
  let showcase = initial;
  const showcasedRoutes = new Set();
  for (const [index, event] of canonical.SHOWCASE_SCENARIO.events.entries()) {
    showcase = send(showcase, main.Message.Advanced());
    const step = canonical.replayCanonical(showcase.history, showcase.position).steps.at(-1);
    assert.deepEqual(step.event, event);
    assert.equal(step.rejection, undefined, `showcase step ${index + 1} must be accepted`);
    const active = elements(showcase, "topology-route").filter((node) => node.data.class.active);
    for (const route of active) showcasedRoutes.add(labels(route));
    if (index === 0) {
      assert.equal(step.after.rounds.length, 0, "pre-edit permit alone must not open a round");
      assert.match(labels(main.view(showcase, inertHtml).body), /1 edit permit: #1/);
      assert.match(labels(main.view(showcase, inertHtml).body), /Before the edit.*Bend issued a permit.*No virtual round is open yet/);
    }
    if (index === 1) {
      assert.deepEqual(step.after.rounds.map((round) => round.id), [1]);
      assert.match(labels(main.view(showcase, inertHtml).body), /0 edit permits/);
      assert.match(labels(main.view(showcase, inertHtml).body), /Why this round opened.*first accepted attributed edit.*Bend opened virtual round/);
    }
    if (index === 7) {
      assert.equal(step.after.dispatch.pending.length, 1, "the second edit waits in the queue");
      assert.ok(active.some((route) => labels(route).includes("dispatch #2 entered pending")));
    }
    if (index === 12) assert.ok(active.some((route) => labels(route).includes("dispatch #2 (pending) → dispatch #2 (running)")));
    if (index === 20) assert.ok(active.some((route) => labels(route).includes("request permitted; native attempt not yet observed")));
    if (index === 25) assert.equal(step.after.dispatch.requests.length, 2, "two Jev requests are in flight");
    if (index === 26) assert.ok(active.some((route) => labels(route).includes("retain finding command")));
    if (index === 27) {
      assert.deepEqual(step.after.collection.ready, [10], "ready advice follows its native storage fact");
      assert.ok(active.some((route) => labels(route).includes("advice #10 supplied ready by native storage")));
    }
    if (index === 30) assert.deepEqual(step.after.collection.ready, [11, 10]);
    if (index === 33) assert.ok(active.some((route) => labels(route).includes("advice #10 leased; still ready")));
    if (index === 38) assert.ok(active.some((route) => labels(route).includes("output authorized; host write not established")));
    if (index === 44) assert.ok(active.some((route) => labels(route).includes("authorized → submitted")));
    if (index === 52) assert.ok(active.some((route) => labels(route).includes("round #1 retired")));
  }
  assert.ok(showcasedRoutes.size >= 12, "the opening replay should expose a broad connected route set");
  const replayAt = (name, count) => {
    const index = canonical.CANONICAL_SCENARIOS.findIndex((scenario) => scenario.name === name);
    assert.notEqual(index, -1, `${name}: source-free scenario exists`);
    let state = send(initial, main.Message.SelectedScenario({ index }));
    for (let step = 0; step < count; step += 1) state = send(state, main.Message.Advanced());
    return state;
  };
  const findingView = replayAt("finding is a distinct observed request result and duplicate is rejected", 7);
  const findingRoutes = elements(findingView, "topology-route").filter((node) => node.data.class.active);
  assert.ok(findingRoutes.some((node) => labels(node).includes("retain finding command; storage not observed")));
  assert.equal(elements(findingView, "topology-node").filter((node) =>
    node.data.class.active && labels(node).includes("Pending advice")).length, 0,
  "retainFinding command alone cannot mark advice as stored");
  const refusalView = replayAt("eight active request permits; ninth settles immediately and release permits another", 29);
  const refusalRoutes = elements(refusalView, "topology-route").filter((node) => node.data.class.active);
  assert.ok(refusalRoutes.some((node) => labels(node).includes("request unavailable or refused")));
  assert.ok(!refusalRoutes.some((node) => labels(node).includes("attempt observed")));
  const manualEvent = (event) => send(
    send(initial, main.Message.DraftChanged({ raw: JSON.stringify(event) })), main.Message.Submitted());
  const retainedFinding = manualEvent({ kind: "collectionFindingCheck", selectionPartition: 1,
    selectionRound: 1, unit: 1, partition: 1, round: 1, snapshot: 1, currentSnapshot: 1,
    credential: 0, currentCredential: 0, ageMs: 0, soloBytes: 100, collectionReady: true,
    selectedCount: 6, prospectiveBytes: 10241 });
  const retainedStep = canonical.replayCanonical(retainedFinding.history, retainedFinding.position).steps.at(-1);
  assert.deepEqual(retainedStep.commands.map((command) => command.kind), ["collectionFindingRetained"]);
  assert.deepEqual(retainedStep.after.collection, retainedStep.before.collection);
  const retainedRoutes = elements(retainedFinding, "topology-route").filter((node) => node.data.class.active);
  assert.ok(retainedRoutes.some((node) => labels(node).includes("collection waits or retains advice")));
  assert.ok(!retainedRoutes.some((node) => labels(node).includes("retain finding command")),
    "collectionFindingRetained does not create advice");
  for (const deadlineReached of [false, true]) {
    const allowed = manualEvent({ kind: "finishReserve", group: 1, lifetime: 1, round: 1,
      attempt: 7, token: 8, selected: [], hasNotice: false, passNotices: true,
      canWrite: true, bindingValid: true, deadlineReached });
    const step = canonical.replayCanonical(allowed.history, allowed.position).steps.at(-1);
    assert.deepEqual(step.commands.map((command) => command.kind),
      [deadlineReached ? "finishAllowedDeadline" : "finishAllowedNoAdvice"]);
    assert.deepEqual(step.after.rounds, step.before.rounds);
    assert.deepEqual(step.after.delivery, step.before.delivery);
    const active = elements(allowed, "topology-route").filter((node) => node.data.class.active);
    assert.ok(active.some((node) => labels(node).includes("collection waits or retains advice")));
    assert.ok(!active.some((node) => labels(node).includes("output fact changed round state")));
    assert.ok(!active.some((node) => labels(node).includes("output authorized")));
  }
  const cancellationRoute = elements(initial, "topology-route").find((node) =>
    labels(node).includes("cancel work command"));
  assert.ok(cancellationRoute);
  assert.match(cancellationRoute.children.find((child) => child.sel === "path").data.attrs.d, /L 12 650 L 12 22/,
    "cancellation command goes around agent and advice nodes");
  const directPreparationView = replayAt("many units admit in order and Stop waits", 2);
  const directRoutes = elements(directPreparationView, "topology-route").filter((node) => node.data.class.active);
  assert.ok(directRoutes.some((node) => labels(node).includes("prepare command emitted")));
  assert.ok(!directRoutes.some((node) => labels(node).includes("entered pending")),
    "beginPreparation did not add a dispatch queue entry");
  const waitingView = replayAt("many units admit in order and Stop waits", 4);
  assert.ok(elements(waitingView, "topology-route").some((node) =>
    node.data.class.active && labels(node).includes("collection waits or retains advice")));
  assert.ok(!elements(waitingView, "topology-route").some((node) =>
    node.data.class.active && labels(node).includes("attempt interrupted / cancelled")));
  let model = send(initial, main.Message.SelectedScenario({
    index: canonical.CANONICAL_SCENARIOS.findIndex((scenario) => scenario.name === canonical.CAPACITY_SCENARIO.name),
  }));
  for (let index = 0; index < fixture.capacityTrace.events.length; index += 1) {
    model = send(model, main.Message.Advanced());
    assert.equal(model.position, index + 1, "guided canonical cursor advances including rejected events");
    const replay = canonical.replayCanonical(model.history, model.position);
    assert.deepEqual(replay.steps[index].event, fixture.capacityTrace.events[index]);
  }
  assert.equal(canonical.guidedIndex(model.history, model.position), fixture.capacityTrace.events.length);
  const capacityReplay = canonical.replayCanonical(model.history, model.position);
  assert.deepEqual(capacityReplay.steps.map((step) => expectedCommand(step, capacityCommand)),
    fixture.capacityTrace.commands, "every capacity command matches the independent trace");
  assert.deepEqual(capacityReplay.steps[7].after.charges, fixture.capacityTrace.afterResizeCharges);
  assert.deepEqual(capacityReplay.projection.global, fixture.capacityTrace.finalGlobal);
  for (const [index, trace] of fixture.traces.entries()) {
    let alternate = send(initial, main.Message.SelectedScenario({ index: index + 2 }));
    for (const event of trace.events) alternate = send(alternate, main.Message.Advanced());
    assert.equal(alternate.position, trace.events.length, `${trace.name}: guided replay includes every result variant`);
    const replay = canonical.replayCanonical(alternate.history, alternate.position);
    assert.deepEqual(replay.steps.map((step) => expectedCommand(step, canonicalCommand)),
      trace.commands, `${trace.name}: every displayed command matches the independent trace`);
    assert.deepEqual(replay.projection.global, trace.global, `${trace.name}: displayed state matches independent expected total`);
    assert.deepEqual(replay.projection.partitions, trace.partitions, `${trace.name}: each agent's usage matches`);
    if (trace.charges) assert.deepEqual(replay.projection.charges, trace.charges, `${trace.name}: reservations match`);
    if (trace.capacity) assert.deepEqual(replay.steps.filter((step) => step.event.kind === "preparationCompleted")
      .map((step) => step.commands.filter((command) => "after" in command).map(capacityFrame)),
      trace.capacity, `${trace.name}: preparation order and values match`);
    assert.equal(replay.projection.rounds.some((round) => round.deciding),
      trace.expectedDecisionPending, `${trace.name}: terminal decision wait matches the independent trace`);
    assert.match(text(alternate), new RegExp(`Guided step ${trace.events.length} of ${trace.events.length}`));
  }
  model = send(initial, main.Message.SelectedScenario({
    index: canonical.CANONICAL_SCENARIOS.findIndex((scenario) => scenario.name === canonical.CAPACITY_SCENARIO.name),
  }));
  model = send(model, main.Message.Advanced());
  model = send(model, main.Message.Advanced());
  model = send(model, main.Message.Advanced());
  const third = canonical.replayCanonical(model.history, model.position).steps[2];
  assert.deepEqual(third.commands.map((command) => command.kind),
    ["preparationReleased", "capacityUnitAdmitted", "capacityUnitRefused", "capacityUnitAdmitted"]);
  assert.deepEqual(third.commands.map((command) => command.after.global),
    [{ items: 1, bytes: 40 }, { items: 2, bytes: 50 }, { items: 2, bytes: 50 }, { items: 3, bytes: 70 }]);
  assert.match(text(model), /Unit 1: accepted.*Unit 2: no capacity.*Unit 3: accepted/s);
  assert.match(text(model), /Before event · 2 shared items · 70 shared bytes/);
  assert.match(text(model), /After event · 3 shared items · 70 shared bytes/);
  let preparation = send(initial, main.Message.SelectedScenario({
    index: canonical.CANONICAL_SCENARIOS.findIndex((scenario) => scenario.name === "many units admit in order and Stop waits"),
  }));
  for (let index = 0; index < 3; index += 1) preparation = send(preparation, main.Message.Advanced());
  assert.match(text(preparation), /Preparation completion decisions/);
  assert.match(text(preparation), /Unit 1: accepted.*Unit 2: no capacity.*Unit 3: accepted/s);
  assert.match(text(preparation), /Before event.*After event/s);
  model = send(model, main.Message.MovedFrame({ frame: 2 }));
  assert.match(text(model), /Frame 3 of 4 · 2 shared items · 50 shared bytes/);
  model = send(model, main.Message.Rewound());
  assert.equal(model.position, 2);
  model = send(model, main.Message.Redid());
  assert.deepEqual(canonical.replayCanonical(model.history, model.position).projection.global, { items: 3, bytes: 70 });
  model = send(model, main.Message.Jumped({ position: 0 }));
  assert.equal(model.position, 0);
  const malformed = canonical.tryAppendCanonical([], 0,
    { kind: "reserveCapacity", partition: 1, bytes: 1, purpose: "invented" }, "manual");
  assert.ok(malformed.error);
  assert.equal(malformed.position, 0);
  assert.throws(() => canonical.projectCanonical({ $: "Canonical.State" }), TypeError);
  assert.equal(imports.IMPORT_GRAPH_SCENARIOS.length, 2);
  const excluded = imports.projectImportExample(0, 9);
  assert.deepEqual(excluded.history.filter((entry) => entry.command.kind === "readSource")
    .map((entry) => entry.command.target), [2], "excluded C receives no source read");
  const overflow = imports.projectImportExample(1, 29);
  assert.deepEqual(overflow.history.filter((entry) => entry.command.kind === "skipImport")
    .map((entry) => [entry.command.target, entry.command.reason]),
    [[8, "Excluded"], [5, "TreeLimit"], [7, "TreeLimit"]]);
  const changedGraphLimits = { ...excluded.states[0].limits, treeBytes: 200 };
  const changed = imports.projectImportExample(0, 1, changedGraphLimits);
  assert.equal(changed.states[0].limits.treeBytes, 200);
  assert.equal(changed.states[0].phase, "incomplete");
  assert.equal(changed.history[0].command.reason, "TreeLimit");
  const changedView = imports.importGraphView(inertHtml, 0, 1, () => ({}), () => ({}), changedGraphLimits);
  const changedText = JSON.stringify(changedView);
  assert.match(changedText, /Tree cap: 200 bytes/);
  assert.doesNotMatch(changedText, /20 KiB limit/);
  assert.ok(timeline.TIMELINE_CASES.length > 0, "retained native timing evidence remains visible");
  Scene.scene({ update: main.update, view: main.view },
    Scene.given(initial),
    Scene.click(Scene.getByRole("button", { name: "Next canonical step: issuePermit", exact: true })),
    Scene.tap((state) => assert.match(Scene.textContent(state.html), /Guided step 1 of 57/)),
    Scene.click(Scene.getByRole("button", { name: "Previous canonical step", exact: true })),
    Scene.tap((state) => assert.match(Scene.textContent(state.html), /Guided step 0 of 57/)));
  console.log("Checked the opening connected replay, compiled canonical inventory, full guided capacity trace, Bend command frames, replay, malformed variants, import graph, and native timing panels.");
} finally {
  await server.close();
}
