import assert from "node:assert/strict";
import { createServer } from "vite";
import { inertHtml } from "foldkit/html";
import { Scene } from "foldkit/test";

// Exercise the same messages and rendered Foldkit view used by the page.
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const graph = await server.ssrLoadModule("/src/generation.ts");
  const timing = await server.ssrLoadModule("/src/timeline.ts");
  const main = await server.ssrLoadModule("/src/main.ts");
  const scenarios = await server.ssrLoadModule("/src/scenarios.ts");
  const bend = await server.ssrLoadModule("/src/bend-flow.ts");
  const renderText = (model) => {
    const read = (node) => typeof node === "string" ? node : node == null ? "" :
      [node.text ?? "", ...(node.children ?? []).map(read)].join(" ");
    return read(main.view(model, inertHtml).body);
  };
  const send = (model, message) => main.update(model, message).model;
  const trigger = (model, event, itemId = null) =>
    send(model, main.Message.TriggeredEvent({ event, itemId }));
  const initial = main.init().model;
  const imports = await server.ssrLoadModule("/src/import-graph-view.ts");
  const excluded = imports.projectImportExample(0, 8);
  assert.deepEqual(excluded.states.map((state) => state.phase), ["incomplete"]);
  assert.equal(excluded.states[0].reason.toLowerCase(), "excluded");
  assert.deepEqual(excluded.history.filter((entry) => entry.command.kind === "readSource").map((entry) => entry.command.target), [2], "excluded C never receives a read request");
  assert.equal(imports.IMPORT_GRAPH_SCENARIOS.length, 2, "the dashboard shows only the two requested A-root traces");
  const treeOverflow = imports.projectImportExample(1, 26);
  assert.equal(treeOverflow.history.length, 26);
  assert.deepEqual(treeOverflow.history.filter((entry) => entry.command.kind === "skipImport").map((entry) => entry.command.target), [5, 7]);
  assert.equal(treeOverflow.history[16].state.phase, "ready", "E skip leaves later imports available");
  assert.equal(treeOverflow.history[4].state.treeBytes, 10240, "A and B use 10 KiB together");
  assert.equal(treeOverflow.history[12].state.treeBytes, 19456, "A, B, C, and D use 19 KiB together");
  assert.equal(treeOverflow.history[16].state.treeBytes, 19456, "E does not fit the remaining 1 KiB");
  assert.equal(treeOverflow.history[20].state.treeBytes, 20480, "F is accepted after E and fills the tree");
  assert.equal(treeOverflow.history[24].state.phase, "ready", "G skip leaves a finalization step");
  assert.equal(treeOverflow.states[0].reason, "TreeLimit");
  assert.equal(treeOverflow.states[0].treeBytes, 20480, "E and G are not charged to the accepted tree");
  assert.equal(treeOverflow.states[0].readBytes, 7000, "all seven source reads count toward the read budget");
  assert.equal(treeOverflow.states[0].files, 7, "all seven file reads count toward the file budget");
  let importModel = send(initial, main.Message.MovedImportCursor({ cursor: 8 }));
  assert.match(renderText(importModel), /A.ts · incomplete/);
  assert.doesNotMatch(renderText(importModel), /D.ts review unit/);
  importModel = send(importModel, main.Message.Reset());
  assert.equal(importModel.importCursor, 8, "full-flow reset preserves separate import replay");
  assert.equal(importModel.historyPosition, 0);
  Scene.scene({ update: main.update, view: main.view },
    Scene.given(initial),
    Scene.click(Scene.getByRole("button", { name: "Next import step", exact: true })),
    Scene.tap((state) => assert.match(Scene.textContent(state.html), /Import step 1 of 8/)),
    Scene.click(Scene.getByRole("button", { name: "Previous import step", exact: true })),
    Scene.tap((state) => assert.match(Scene.textContent(state.html), /Import step 0 of 8/)));

  assert.match(renderText(initial), /COMPILED BEND FLOW MODEL/);
  assert.match(renderText(initial), /IMPORT \/ REFERENCE GRAPH/);
  assert.match(renderText(initial), /not a trace of the production resident/);
  assert.doesNotMatch(renderText(initial), /TypeScript sidecar reducer|Routes and .* applied steps match/);
  assert.equal(bend.stepBend(initial.bend, bend.flowInput("StopHookFired")).reason, "virtualRoundClosed");
  const rejected = trigger(initial, "StopHookFired");
  assert.equal(rejected.history.length, 0);
  assert.match(renderText(rejected), /This virtual round is closed/);

  for (const [index, trace] of scenarios.TRACES.entries()) {
    let model = send(initial, main.Message.SelectedTrace({ index }));
    for (const [cursor, expected] of graph.PROJECTED_TRACES[index].entries()) {
      model = send(model, main.Message.Advanced());
      assert.equal(model.cursor, cursor + 1, `${trace.name}: guide cursor`);
      assert.deepEqual(bend.projectBend(model.bend), expected.state, `${trace.name}: Bend-guided state`);
      assert.equal(model.history.length, cursor + 1, `${trace.name}: accepted history`);
    }
    assert.match(renderText(model), new RegExp(`Guided step ${trace.events.length} of ${trace.events.length}`));
  }

  let mixed = send(initial, main.Message.SelectedTrace({ index: 1 }));
  mixed = send(mixed, main.Message.Advanced());
  mixed = trigger(mixed, "EditObserved");
  mixed = send(mixed, main.Message.Advanced());
  assert.equal(mixed.cursor, 2);
  assert.equal(bend.projectBend(mixed.bend).packets.find((packet) => packet.id === 1)?.at, "jev");
  assert.equal(bend.projectBend(mixed.bend).packets.find((packet) => packet.id === 2)?.at, "preparation");
  assert.equal(mixed.history[2].origin, "guided");
  assert.equal(mixed.history[2].itemId, 1, "guided item binding survives manual interleaving");

  let capacity = send(initial, main.Message.CapacitySubmitted({ capacityType: "source", raw: "1" }));
  capacity = trigger(trigger(capacity, "EditObserved"), "EditObserved");
  assert.equal(bend.projectBend(capacity.bend).packets.find((packet) => packet.id === 2)?.at, "editQueue");
  capacity = send(capacity, main.Message.CapacitySubmitted({ capacityType: "source", raw: "2" }));
  assert.equal(bend.projectBend(capacity.bend).packets.find((packet) => packet.id === 2)?.at, "preparation");
  const invalid = send(capacity, main.Message.CapacitySubmitted({ capacityType: "jev", raw: "0" }));
  assert.equal(invalid.history.length, capacity.history.length);
  assert.match(renderText(invalid), /Choose a positive whole number/);

  let finish = trigger(initial, "EditObserved");
  finish = trigger(finish, "ReviewUnitPrepared");
  finish = trigger(finish, "JevFindingReceived");
  finish = trigger(finish, "StopHookFired");
  assert.equal(finish.lastFinishDecision.response, "continueWithAdvice");
  assert.deepEqual(finish.lastFinishDecision.adviceItemIds, [1]);
  assert.match(renderText(finish), /Continue with advice/);
  let allowed = trigger(initial, "EditObserved");
  allowed = trigger(allowed, "ReviewUnitPrepared");
  allowed = trigger(allowed, "StopHookFired");
  allowed = trigger(allowed, "FinishDecisionDeadlineReached");
  assert.equal(allowed.lastFinishDecision.response, "allowFinish");
  assert.equal(bend.projectBend(allowed.bend).virtualRoundActive, false);
  assert.match(renderText(allowed), /Cancel Jev requests: #1/);
  const replayed = send(send(allowed, main.Message.Rewound()), main.Message.Redid());
  assert.deepEqual(bend.projectBend(replayed.bend), bend.projectBend(allowed.bend));
  assert.deepEqual(replayed.lastFinishDecision, allowed.lastFinishDecision);
  assert.equal(replayed.historyPosition, allowed.historyPosition);
  const jumped = send(allowed, main.Message.JumpedToHistory({ count: 1 }));
  assert.equal(bend.projectBend(jumped.bend).virtualRoundActive, true);
  assert.equal(jumped.historyPosition, 1);
  assert.equal(jumped.history.length, allowed.history.length);
  assert.equal(trigger(jumped, "EditObserved").history.length, 2, "new accepted action replaces the future tail");

  // Scene clicks and input changes exercise the actual Foldkit control wiring.
  Scene.scene({ update: main.update, view: main.view },
    Scene.given(initial),
    Scene.click(Scene.getByRole("button", { name: /^Next: proven fresh edit admitted/ })),
    Scene.tap((state) => assert.match(Scene.textContent(state.html), /Guided step 1 of 13/)),
    Scene.click(Scene.getByRole("button", { name: /^Previous:/ })),
    Scene.tap((state) => assert.match(Scene.textContent(state.html), /Guided step 0 of 13/)),
    Scene.click(Scene.getByRole("button", { name: /^Redo:/ })),
    Scene.tap((state) => assert.match(Scene.textContent(state.html), /Guided step 1 of 13/)));
  Scene.scene({ update: main.update, view: main.view },
    Scene.given(initial),
    Scene.change(Scene.getByLabel("Concurrent source readings"), "1"),
    Scene.click(Scene.getByRole("button", { name: /^1proven fresh edit admitted/ })),
    Scene.tap((state) => {
      const text = Scene.textContent(state.html);
      assert.match(text, /Virtual round 1 \(active\)/);
      assert.match(text, /source readings 1\/1/);
    }));

  if (graph.CONNECTIONS.length === 0 || timing.REDUCER_SEGMENTS.length !== timing.TIMELINE_CASES.length) {
    throw new Error("Incomplete Bend model projection");
  }
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[0-9a-f]{40}\/evidence\/.+\/$/.test(timing.EVIDENCE_BASE)) {
    throw new Error("Native timing evidence must link to a pinned repository commit");
  }
  for (const scenario of timing.TIMELINE_CASES) {
    const declared = new Set(scenario.sources);
    for (const source of declared) {
      if (source.includes("/") || source.includes("..") || !/^[a-z0-9][a-z0-9.-]*$/i.test(source)) {
        throw new Error(`Invalid pinned source name for ${scenario.title}: ${source}`);
      }
    }
    for (const panel of scenario.panels) {
      for (const entry of panel.entries) {
        if (entry.kind === "native observation" && !declared.has(entry.source)) {
          throw new Error(`Undeclared native source for ${scenario.title}: ${entry.source}`);
        }
        if (!Number.isFinite(entry.at) || entry.at < 0 ||
            (entry.until !== undefined && (!Number.isFinite(entry.until) || entry.until < entry.at))) {
          throw new Error(`Invalid displayed timing in ${scenario.title}: ${entry.label}`);
        }
      }
    }
  }
  process.stdout.write(`Checked ${graph.PROJECTED_TRACES.length} guided scenarios, ${imports.IMPORT_GRAPH_SCENARIOS.length} import examples, focused Foldkit interactions, and ${timing.REDUCER_SEGMENTS.length} timeline companions.\n`);
} finally {
  await server.close();
}
