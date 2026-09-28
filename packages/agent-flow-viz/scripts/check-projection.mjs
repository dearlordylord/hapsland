import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";
import { inertHtml } from "foldkit/html";
import { Scene } from "foldkit/test";

const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../conformance/canonical-v1.json"), "utf8"));
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
  assert.deepEqual(inventory.CAPACITY_INVENTORY.map((entry) => entry.purpose),
    compiled.inventory.map((entry) => entry.purpose));
  assert.deepEqual(inventory.CAPACITY_INVENTORY.map((entry) => entry.limits),
    compiled.inventory.map((entry) => Object.keys(entry.limits)));
  assert.match(text(initial), /CANONICAL BEND PRODUCTION MODEL/);
  assert.match(text(initial), /What uses review capacity/);
  assert.match(text(initial), /Native Hapsland effects/);
  assert.match(text(initial), /Jev response · external/);
  let model = initial;
  for (let index = 0; index < fixture.capacityTrace.events.length; index += 1) {
    model = send(model, main.Message.Advanced());
    assert.equal(model.position, index + 1, "guided canonical cursor advances including rejected events");
    const replay = canonical.replayCanonical(model.history, model.position);
    assert.deepEqual(replay.steps[index].event, fixture.capacityTrace.events[index]);
  }
  assert.equal(canonical.guidedIndex(model.history, model.position), fixture.capacityTrace.events.length);
  assert.deepEqual(canonical.replayCanonical(model.history, model.position).projection.global, fixture.capacityTrace.finalGlobal);
  for (const [index, trace] of fixture.traces.entries()) {
    let alternate = send(initial, main.Message.SelectedScenario({ index: index + 1 }));
    for (const event of trace.events) alternate = send(alternate, main.Message.Advanced());
    assert.equal(alternate.position, trace.events.length, `${trace.name}: guided replay includes every result variant`);
    assert.deepEqual(canonical.replayCanonical(alternate.history, alternate.position).projection.global,
      trace.global, `${trace.name}: displayed state matches independent expected total`);
    assert.match(text(alternate), new RegExp(`Guided step ${trace.events.length} of ${trace.events.length}`));
  }
  model = send(initial, main.Message.Advanced());
  model = send(model, main.Message.Advanced());
  model = send(model, main.Message.Advanced());
  const third = canonical.replayCanonical(model.history, model.position).steps[2];
  assert.deepEqual(third.commands.map((command) => command.kind),
    ["preparationReleased", "capacityUnitAdmitted", "capacityUnitRefused", "capacityUnitAdmitted"]);
  assert.deepEqual(third.commands.map((command) => command.after.global),
    [{ items: 1, bytes: 40 }, { items: 2, bytes: 50 }, { items: 2, bytes: 50 }, { items: 3, bytes: 70 }]);
  assert.match(text(model), /Unit 1: accepted.*Unit 2: no capacity.*Unit 3: accepted/s);
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
  assert.ok(timeline.TIMELINE_CASES.length > 0, "retained native timing evidence remains visible");
  Scene.scene({ update: main.update, view: main.view },
    Scene.given(initial),
    Scene.click(Scene.getByRole("button", { name: "Next canonical step: reserveCapacity", exact: true })),
    Scene.tap((state) => assert.match(Scene.textContent(state.html), /Guided step 1 of 11/)),
    Scene.click(Scene.getByRole("button", { name: "Previous canonical step", exact: true })),
    Scene.tap((state) => assert.match(Scene.textContent(state.html), /Guided step 0 of 11/)));
  console.log("Checked compiled canonical inventory, full guided capacity trace, Bend command frames, replay, malformed variants, import graph, and native timing panels.");
} finally {
  await server.close();
}
