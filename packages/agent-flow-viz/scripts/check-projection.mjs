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
  const numbering = await server.ssrLoadModule(`/@fs${resolve(import.meta.dirname, "../../agent-flow-projection/src/index.ts")}`);
  const driver = await server.ssrLoadModule(`/@fs${resolve(import.meta.dirname, "../../monkey-business/src/index.ts")}`);
  for (const square of Object.values(presentation.SQUARES)) for (const facet of square.facets(compiled)) {
    assert.equal(facet.count, 0, "initial checked records have explicit zero facets");
    for (const count of [0, 1, 100]) {
      // Presentation fixtures exercise magnitude formatting, not admission or capacity claims.
      const row = presentation.squareFacetLine({ ...facet, count, references: Array.from({ length: count }, (_, index) => `#${Number.MAX_SAFE_INTEGER - index}`) });
      assert.ok(row.startsWith(`${count} `));
      if (count === 0) assert.doesNotMatch(row, /none|#|more/);
      assert.ok(row.length <= 42, "identity samples cannot crowd out exact facet counts");
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
      if (frame.after.work.filter((work) => work.kind === "awaitingSourceRead").length === count) { observed = frame.after; break; }
    }
    assert.ok(observed, `checked burst reaches ${count} queued sources`);
    const facet = presentation.SQUARES.sourcePending.facets(observed).find((item) => item.label === "pending source reads");
    assert.equal(facet.count, count);
    assert.match(JSON.stringify(flowView.productionFlowView(inertHtml, observed, undefined, false)), new RegExp(`${count} pending source read`));
    assert.equal(presentation.SQUARES.scheduling.facets(observed)[2].count, observed.dispatch.running.filter((entry) => entry.preparation).length);
    assert.equal(presentation.SQUARES.scheduling.facets(observed)[3].count, observed.dispatch.running.filter((entry) => !entry.preparation).length);
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
  const visibleLabels = (node) => (node.children ?? []).slice(1).map(labels).join(" "); // SVG title is first child.
  assert.equal(elements(initial, "topology-node").length, 14);
  assert.equal(elements(initial, "topology-route").length, 25);
  assert.equal(elements(initial, "topology-route").filter((node) => node.data.class.active).length, 0);
  assert.equal(canonical.CANONICAL_SCENARIOS[initial.scenario].name, canonical.SHOWCASE_SCENARIO.name);
  let showcase = initial;
  const showcasedRoutes = new Set();
  for (const [index, event] of canonical.SHOWCASE_SCENARIO.events.entries()) {
    showcase = send(showcase, main.Message.HistoryForward());
    let step = canonical.replayCanonical(showcase.history, showcase.position, canonical.SHOWCASE_SCENARIO.limits).steps.at(-1);
    while (step.event.kind === "preparationGraph") {
      assert.deepEqual(step.before, step.after, "inner graph steps must preserve canonical state");
      assert.equal(elements(showcase, "topology-route").filter(node => node.data.class.active).length, 0);
      assert.match(labels(main.view(showcase, inertHtml).body), /tree [12]/);
      assert.equal(elements(showcase, "preparation-mini").length, 1);
      assert.equal(elements(showcase, "preparation-subprocess").length, 0, "the main diagram must not duplicate the large graph panel");
      if (step.preparation.after.phase === "capturing")
        assert.ok(elements(showcase, "preparation-mini-node").some(node => node.data.class.active && labels(node).includes("Capture")));
      if (step.preparation.after.phase === "complete")
        assert.ok(elements(showcase, "preparation-mini-node").some(node => node.data.class.active && labels(node).includes("Complete")));
      showcase = send(showcase, main.Message.HistoryForward());
      step = canonical.replayCanonical(showcase.history, showcase.position, canonical.SHOWCASE_SCENARIO.limits).steps.at(-1);
    }
    assert.deepEqual(step.event, event);
    assert.equal(step.rejection, undefined, `showcase step ${index + 1} must be accepted`);
    const active = elements(showcase, "topology-route").filter((node) => node.data.class.active);
    for (const route of active) showcasedRoutes.add(labels(route));
    if (index === 0) {
      assert.equal(step.after.rounds.length, 0, "pre-edit permit alone must not open a round");
      assert.match(labels(main.view(showcase, inertHtml).body), /1 edit permit: Permit #1/);
      assert.match(labels(main.view(showcase, inertHtml).body), /Before the edit.*Bend issued a permit.*No virtual round is open yet/);
      assert.match(labels(elements(showcase, "topology-node").find((node) => labels(node).includes("Admission & capacity"))), /NOW · Permit #1 issued/);
    }
    if (index === 1) {
      assert.deepEqual(step.after.rounds.map((round) => round.id), [1]);
      assert.match(labels(main.view(showcase, inertHtml).body), /0 edit permits/);
      assert.match(labels(main.view(showcase, inertHtml).body), /Why this round opened.*first accepted attributed edit.*Bend opened virtual round/);
      assert.match(labels(elements(showcase, "topology-node").find((node) => labels(node).includes("Round state"))), /NOW · Round #1 opened with edit #1/);
    }
    if (index === 2) assert.match(labels(elements(showcase, "topology-node").find((node) => labels(node).includes("Awaiting source read"))),
      /NOW · Source #1 admitted · Round #1/);
    if (index === 5) {
      const nodes = elements(showcase, "topology-node");
      assert.match(labels(nodes.find((node) => labels(node).includes("Agent edit"))), /NOW · edit #2 accepted/);
      assert.match(labels(nodes.find((node) => labels(node).includes("Admission & capacity"))), /NOW · permit #2 used/);
      assert.match(labels(nodes.find((node) => labels(node).includes("Round state"))), /NOW · edit #2 joined Round #1/);
      assert.deepEqual(step.after.rounds.map((round) => round.id), [1]);
      assert.equal(step.after.work.length, 1, "the accepted edit has no second source work until admission");
    }
    if (index === 7) {
      assert.equal(step.after.dispatch.queued.length, 0, "the second edit starts while a preparation slot is free");
      showcase = send(showcase, main.Message.SelectedFlowStage({ stage: "scheduling" }));
      const detail = labels(elements(showcase, "flow-stage-inspector")[0]);
      assert.match(detail, /running preparation jobs: 2.*Source read #1 · operation 1 · agent 1 · round 1 · seq 0 · preparation.*Source read #2 · operation 2 · agent 1 · round 1 · seq 1 · preparation/s);
      const unselected = send(showcase, main.Message.SelectedFlowStage({ stage: "" }));
      for (const stage of presentation.PLACE_ORDER) {
        const selected = send(unselected, main.Message.SelectedFlowStage({ stage }));
        assert.equal(selected.flowStage, stage);
        assert.equal(elements(selected, "flow-stage-inspector").length, 1);
        assert.equal(send(selected, main.Message.SelectedFlowStage({ stage })).flowStage, "",
          "clicking an inspected square again closes its details");
        assert.equal(send(selected, main.Message.SelectedFlowStage({ stage: "" })).flowStage, "",
          "the close button clears the inspected square");
      }
    }
    if (index === 8) {
      showcase = send(showcase, main.Message.SelectedFlowStage({ stage: "sourcePending" }));
      const detail = labels(elements(showcase, "flow-stage-inspector")[0]);
      assert.match(detail, /pending source reads: 1.*#2/s);
      assert.doesNotMatch(detail, /pending source reads: 2/);
    }
    if (index === 12) assert.equal(step.after.dispatch.running.length, 1, "the second preparation remains active after the first settles");
    if (index === 11) {
      assert.equal(active.length, 0, "source completion has no invented movement arrow");
      assert.match(labels(elements(showcase, "topology-node").find((node) => labels(node).includes("Read & prepare source"))),
        /NOW · Source read #1 completed/);
      assert.match(labels(elements(showcase, "flow-provenance")[0]),
        /Source read #1 completed.*Review item #1 continues; source preparation job still marked running/);
    }
    if (index === 12) assert.doesNotMatch(labels(elements(showcase, "topology-node").find((node) => labels(node).includes("Read & prepare source"))),
      /Source read #1 completed/, "the completion marker is transient");
    if (index === 15) {
      showcase = send(showcase, main.Message.SelectedFlowStage({ stage: "" }));
      showcase = send(showcase, main.Message.SelectedFlowStage({ stage: "units" }));
      const detail = labels(elements(showcase, "flow-stage-inspector")[0]);
      assert.match(detail, /Review item #1 · operation 4/);
      assert.match(detail, /Review item #2 · operation 6/);
      assert.match(detail, /Unit charge #1 · charge 2/);
      assert.match(detail, /Unit charge #2 · charge 4/);
    }
    if (index === 10) {
      const numbered = numbering.numberRecords(canonical.replayCanonical(showcase.history, showcase.position, canonical.SHOWCASE_SCENARIO.limits).steps);
      assert.equal(numbered.source.get(1), 1);
      assert.equal(numbered.source.get(2), 2);
      assert.equal(numbered.preparation.get(3), 1);
      assert.equal(numbered.review.get(4), 1);
      assert.equal(numbered["charge:preparation"].get(1), 1);
      assert.equal(numbered["charge:reviewUnit"].get(2), 1);
      showcase = send(showcase, main.Message.SelectedFlowStage({ stage: "units" }));
      const detail = labels(elements(showcase, "flow-stage-inspector")[0]);
      assert.match(detail, /Review item #1 · operation 4/);
      assert.match(detail, /Unit charge #1 · charge 2/);
      assert.doesNotMatch(detail, /Review item #4/);
      assert.doesNotMatch(detail, /Unit charge #2/);
    }
    if (index === 20) assert.ok(active.some((route) => labels(route).includes("request permitted; native attempt not yet observed")));
    if (index === 25) assert.equal(step.after.dispatch.requests.length, 2, "two Jev requests are in flight");
    if (index === 26) {
      assert.ok(!active.some((route) => labels(route).includes("retain finding command")));
      assert.match(visibleLabels(elements(showcase, "topology-node").find((node) => labels(node).includes("Review outcomes"))),
        /CMD · retain finding for Review item #1/);
      const admission = labels(elements(showcase, "topology-node").find((node) => labels(node).includes("Admission & capacity")));
      assert.match(admission, /1 stored result charge: Stored result charge #1/);
      assert.match(admission, /NOW · Unit charge #1 → stored/);
    }
    if (index === 27) {
      assert.deepEqual(step.after.collection.ready, [4], "Bend links ready advice to its finding work and edit");
      assert.ok(active.some((route) => labels(route).includes("Bend marked Advice #1/operation 4 ready from Review item #1/operation 4")));
      assert.match(visibleLabels(elements(showcase, "topology-node").find((node) => labels(node).includes("Ready advice"))),
        /NOW · Advice #1 ← Review item #1/);
    }
    if (index === 29) {
      assert.deepEqual(step.after.collection.ready, [4], "advice for edit #2 waits for its other review item");
      assert.match(visibleLabels(elements(showcase, "topology-node").find((node) => labels(node).includes("Review outcomes"))),
        /1 waiting · Review #2→#3.*CMD · retain Review #2; waits for #3/s);
      assert.ok(!active.some((route) => labels(route).includes("Bend marked Advice #2")));
    }
    if (index >= 30 && index <= 34) assert.match(visibleLabels(elements(showcase, "topology-node").find((node) => labels(node).includes("Review outcomes"))),
      /1 waiting · Review #2→#3/, "the earlier finding and its unfinished sibling remain visible until clear");
    if (index === 35) {
      assert.equal(step.event.kind, "jevRequestSettled");
      assert.equal(step.event.outcome, "clear");
      assert.ok(!active.some((route) => labels(route).includes("retain finding command")));
      assert.ok(!step.after.work.some((work) => work.operation === 7));
      assert.ok(!step.after.charges.some((charge) => charge.id === 5));
      assert.deepEqual(step.after.collection.ready, [4]);
      assert.match(labels(elements(showcase, "topology-node").find((node) => labels(node).includes("Review outcomes"))),
        /NOW · Review item #3 clear/);
    }
    if (index === 36) assert.doesNotMatch(labels(elements(showcase, "topology-node").find((node) => labels(node).includes("Review outcomes"))),
      /Review item #3 clear/, "the clear marker is transient");
    if (index === 37) {
      assert.deepEqual(step.after.collection.ready, [6, 4],
        "advice for edit #2 becomes ready after its clear sibling settles");
      assert.match(visibleLabels(elements(showcase, "topology-node").find((node) => labels(node).includes("Ready advice"))),
        /NOW · Advice #2 ← Review item #2/);
      showcase = send(showcase, main.Message.SelectedFlowStage({ stage: "advice" }));
      assert.match(labels(elements(showcase, "flow-stage-inspector")[0]),
        /Advice #2.*Review item #2.*edit observation #2/s);
    }
    const stopCaption = new Map([
      [38, /Stop decision ready; this step does not reserve or send output/],
      [39, /Advice #1 leased for collection; still ready/],
      [40, /2 advice groups leased for one Stop output; no output slot is reserved yet/],
      [41, /Stop output slot reserved for 2 selected advice groups; output is not yet authorized/],
      [42, /Advice #1 submission reserved for Stop output; no host write is established/],
      [43, /2 advice records staged for one Stop output; no host write is established/],
      [44, /Stop output authorized; no host write is established/],
      [45, /Advice #1 submission authorized; acknowledgment remains to be checked/],
      [46, /Advice #2 submission authorized; acknowledgment remains to be checked/],
      [47, /Acknowledgment gate passed for 2 items; no host write is observed by this step/],
      [48, /Advice #1 submission recorded as certain/],
      [49, /Advice #2 submission recorded as certain/],
      [50, /Stop result recorded as acknowledged; agent use of advice is not observed/],
    ]).get(index);
    if (stopCaption !== undefined) assert.match(labels(elements(showcase, "topology-current-step")[0]), stopCaption);
    if (index === 44) assert.ok(labels(main.view(showcase, inertHtml).body).includes("Advice output authorized"));
    if (index === 43) assert.match(visibleLabels(elements(showcase, "topology-node").find((node) => labels(node).includes("Host output"))),
      /2 records · #1:reserved, #2:reserved/);
    if (index === 45) assert.match(visibleLabels(elements(showcase, "topology-node").find((node) => labels(node).includes("Host output"))),
      /2 records · #1:authorized, #2:reserved/);
    if (index === 46) assert.match(visibleLabels(elements(showcase, "topology-node").find((node) => labels(node).includes("Host output"))),
      /2 records · #1:authorized, #2:authorized/);
    if (index === 39) assert.ok(active.some((route) => labels(route).includes("Advice #1/operation 4 leased; still ready")));
    if (index === 44) assert.ok(active.some((route) => labels(route).includes("output authorized; host write not established")));
    if (index === 50) assert.ok(active.some((route) => labels(route).includes("authorized → submitted")));
    if (index === 58) assert.ok(active.some((route) => labels(route).includes("round #1 retired")));
  }
  const atGuided = (count) => showcase.history.findIndex((_, index) => canonical.guidedIndex(showcase.history, index + 1) === count) + 1;
  let grouped = send(showcase, main.Message.Jumped({ position: atGuided(39) }));
  grouped = send(grouped, main.Message.Advanced());
  assert.equal(canonical.guidedIndex(grouped.history, grouped.position), 41);
  assert.match(labels(elements(grouped, "topology-current-step")[0]), /2 advice groups leased for one Stop output/);
  assert.match(labels(elements(grouped, "topology-route").find((node) => labels(node).includes("Advice #1/operation 4 leased"))), /Advice #2\/operation 6 leased/);
  grouped = send(grouped, main.Message.Advanced());
  assert.equal(canonical.guidedIndex(grouped.history, grouped.position), 42);
  grouped = send(grouped, main.Message.Advanced());
  assert.equal(canonical.guidedIndex(grouped.history, grouped.position), 44);
  assert.match(labels(elements(grouped, "topology-current-step")[0]), /2 advice records staged for one Stop output/);
  assert.ok(showcasedRoutes.size >= 12, "the opening replay should expose a broad connected route set");
  const allNumbers = numbering.numberRecords(canonical.replayCanonical(showcase.history, showcase.position, canonical.SHOWCASE_SCENARIO.limits).steps);
  assert.deepEqual([...allNumbers.review], [[4, 1], [6, 2], [7, 3]], "review ordinals survive the disappearance of work records");
  assert.deepEqual([...allNumbers.request], [[8, 1], [9, 2], [10, 3]], "Jev requests have their own sequence");
  assert.deepEqual([...allNumbers.advice], [[4, 1], [6, 2]], "advice has its own sequence despite sharing canonical operation IDs");
  assert.equal(numbering.recordLabel("review", 4, numbering.numberRecords([])), "Review item/operation 4",
    "a clipped history must not invent a display ordinal");
  const replayAt = (name, count) => {
    const index = canonical.CANONICAL_SCENARIOS.findIndex((scenario) => scenario.name === name);
    assert.notEqual(index, -1, `${name}: source-free scenario exists`);
    let state = send(initial, main.Message.SelectedScenario({ index }));
    for (let step = 0; step < count; step += 1) state = send(state, main.Message.Advanced());
    return state;
  };
  const findingView = replayAt("finding is a distinct observed request result and duplicate is rejected", 7);
  const findingRoutes = elements(findingView, "topology-route").filter((node) => node.data.class.active);
  assert.ok(!findingRoutes.some((node) => labels(node).includes("retain finding command; storage not observed")));
  assert.match(labels(elements(findingView, "topology-node").find((node) => labels(node).includes("Review outcomes"))),
    /CMD · retain finding for Review item/);
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
  // The planned timeline is present before execution and seeking is the same checked replay.
  let timelineModel = main.init().model;
  assert.equal(canonical.historyTimelineLength(timelineModel.history), 104);
  timelineModel = send(timelineModel, main.Message.Jumped({ position: 104 }));
  assert.equal(timelineModel.position, 104);
  assert.equal(canonical.guidedIndex(timelineModel.history, timelineModel.position), 63);
  assert.equal(timelineModel.history.filter(entry => entry.event.kind === "preparationGraph").length, 41);
  const completeHistory = timelineModel.history;
  assert.deepEqual(completeHistory, showcase.history, "single-pass seeking matches ordinary checked step-by-step replay");
  timelineModel = send(timelineModel, main.Message.Jumped({ position: 5 }));
  assert.deepEqual(timelineModel.history, completeHistory, "backward seek preserves the recorded future");
  timelineModel = send(timelineModel, main.Message.Jumped({ position: 104 }));
  assert.deepEqual(timelineModel.history, completeHistory, "forward seek reuses recorded events");
  timelineModel = send(timelineModel, main.Message.Jumped({ position: 0 }));
  const harmlessManual = { kind: "fileSelectionCheck", protected: false, excluded: false, includesEmpty: false, included: true };
  timelineModel = send(timelineModel, main.Message.DraftChanged({ raw: JSON.stringify(harmlessManual) }));
  timelineModel = send(timelineModel, main.Message.Submitted());
  assert.equal(canonical.historyTimelineLength(timelineModel.history), 105);
  timelineModel = send(timelineModel, main.Message.Jumped({ position: 105 }));
  assert.equal(timelineModel.position, 105);
  assert.deepEqual(timelineModel.history[0].event, harmlessManual);
  assert.equal(canonical.guidedIndex(timelineModel.history, timelineModel.position), 63);
  timelineModel = send(timelineModel, main.Message.DraftChanged({ raw: '{"kind":"madeUp"}' }));
  timelineModel = send(timelineModel, main.Message.Submitted());
  assert.equal(canonical.historyTimelineLength(timelineModel.history), 105, "invalid shapes add no timeline positions");
  timelineModel = send(timelineModel, main.Message.DraftChanged({ raw: '{"kind":"interruptPreparation","partition":1,"lifetime":1,"round":1,"operation":999}' }));
  timelineModel = send(timelineModel, main.Message.Submitted());
  assert.equal(canonical.historyTimelineLength(timelineModel.history), 106, "checked rejected events remain in history");
  assert.match(timelineModel.feedback, /Bend rejected/);
  timelineModel = send(main.init().model, main.Message.Jumped({ position: 10 }));
  timelineModel = send(timelineModel, main.Message.DraftChanged({ raw: '{"kind":"interruptPreparation","partition":1,"lifetime":1,"round":1,"operation":3}' }));
  timelineModel = send(timelineModel, main.Message.Submitted());
  const cancelledHistory = timelineModel.history;
  timelineModel = send(timelineModel, main.Message.Jumped({ position: 105 }));
  assert.equal(timelineModel.position, 11);
  assert.deepEqual(timelineModel.history, cancelledHistory, "unreachable graph facts never enter checked history");
  assert.match(timelineModel.feedback, /Cannot reach timeline event 105.*active enclosing preparation/);
  // Every declared scenario advertises its complete event horizon without being played first.
  for (let scenario = 1; scenario < canonical.CANONICAL_SCENARIOS.length; scenario++) {
    const selected = send(main.init().model, main.Message.SelectedScenario({ index: scenario }));
    assert.equal(canonical.historyTimelineLength(selected.history, scenario), canonical.CANONICAL_SCENARIOS[scenario].events.length);
  }
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
    Scene.click(Scene.getByRole("button", { name: "Next: issuePermit", exact: true })),
    Scene.tap((state) => assert.match(Scene.textContent(state.html), /Guided step 1 of 63/)),
    Scene.click(Scene.getByRole("button", { name: "Previous history event", exact: true })),
    Scene.tap((state) => assert.match(Scene.textContent(state.html), /Guided step 0 of 63/)));
  console.log("Checked the opening connected replay, compiled canonical inventory, full guided capacity trace, Bend command frames, replay, malformed variants, import graph, and native timing panels.");
} finally {
  await server.close();
}
