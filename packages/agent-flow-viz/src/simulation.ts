import { locateFlow, projectFlowStep } from "@hapsland/agent-flow-projection";
import { Schema } from "effect";
import type { HtmlBuilder } from "foldkit/html";
import {
  createRun,
  restoreReplay,
  replayRun,
  type Replay,
  type Control,
  type Observation,
} from "../../monkey-business/src/index";
import type { ReplayStep } from "./canonical-replay";
import { SQUARES, PLACE_ORDER } from "./production-flow-presentation";
import { productionFlowView } from "./production-flow-view";

export const SimulationModel = Schema.Struct({
  seed: Schema.String,
  pace: Schema.String,
  burst: Schema.String,
  delay: Schema.String,
  outcome: Schema.String,
  bytes: Schema.String,
  speed: Schema.String,
  replay: Schema.String,
  appliedSpeed: Schema.Number,
  applied: Schema.String,
  filter: Schema.String,
  focus: Schema.String,
  stage: Schema.String,
  item: Schema.String,
  bookmark: Schema.Number,
  playing: Schema.Boolean,
  suspended: Schema.Boolean,
  revision: Schema.Number,
  selected: Schema.Number,
  feedback: Schema.String,
});
export type SimulationModel = typeof SimulationModel.Type;
export const initialSimulation: SimulationModel = {
  seed: "7",
  pace: "100",
  burst: "5",
  delay: "50",
  outcome: "finding",
  bytes: "100",
  speed: "10",
  replay: "",
  appliedSpeed: 10,
  applied: "No run started.",
  filter: "all",
  focus: "",
  stage: "advice",
  item: "",
  bookmark: -1,
  playing: false,
  suspended: false,
  revision: 0,
  selected: -1,
  feedback: "Start a seeded source-free session. Jev effects are simulated.",
};
let run: ReturnType<typeof createRun> | undefined;
let wallBudget = 0;
let fileError: string | undefined;
let replayEndpoint: Replay["endpoint"] | undefined;
let replaySource: Replay | undefined;
const completeReplay = () => {
  if (run && replaySource && run.eventCount >= replaySource.endpoint.eventCount) {
    totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0 };
    run = restoreReplay(replaySource, countFrame);
    replayEndpoint = undefined;
    replaySource = undefined;
    return true;
  }
  return false;
};
class InputError extends Error {}
let totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0 };
const countFrame = (item: Observation) => {
  totals.checked++;
  totals.admitted += item.commands.filter((command) => command.kind === "observationAdmitted").length;
  totals.refused += item.rejection ? 1 : item.commands.filter((command) => /Refused$|Denied$|Unavailable$/.test(command.kind)).length;
  if (/fail|timeout/i.test(JSON.stringify(item.event))) totals.failed++;
  totals.advice += item.commands.filter((command) => command.kind === "submissionRecorded").length;
};
const speedValue = (raw: string) => {
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value) || value < 0.01 || value > 1000)
    throw new InputError("Playback speed must be a number from 0.01 to 1000.");
  return value;
};
const number = (raw: string, name: string, min: number, max: number) => {
  const value = Number(raw);
  if (!raw.trim() || !Number.isSafeInteger(value) || value < min || value > max)
    throw new InputError(`${name} must be an integer from ${min} to ${max}.`);
  return value;
};
export const changeSimulation = (
  model: SimulationModel,
  field: string,
  raw: string,
): SimulationModel => {
  if (
    ![
      "seed",
      "pace",
      "burst",
      "delay",
      "outcome",
      "bytes",
      "speed",
      "replay",
      "stage",
    ].includes(field)
  )
    return model;
  return { ...model, [field]: raw };
};
export const actSimulation = (
  model: SimulationModel,
  action: string,
): SimulationModel => {
  try {
    const exported = () => ({ ...run!.exportReplay(), dashboard: { bookmark: model.bookmark } });
    if (action === "replay-start" && run) {
      const inputs = run.exportReplay();
      run = replayRun(inputs);
      totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0 };
      run.subscribe(countFrame);
      replayEndpoint = inputs.endpoint;
      replaySource = inputs;
      wallBudget = 0;
      return { ...model, selected: -1, playing: false, suspended: false, revision: model.revision + 1, feedback: "Replay reset to initial inputs. Resume or Single step to replay recorded controls to its endpoint." };
    }
    if (action.startsWith("item:")) return { ...model, item: action.slice(5) };
    if (action === "focus-stage") return { ...model, focus: model.stage, item: "" };
    if (action === "download" && run) {
      const link = document.createElement("a");
      const url = URL.createObjectURL(new Blob([JSON.stringify(exported(), null, 2)], { type: "application/json" }));
      link.href = url;
      link.download = "hapsland-simulation-replay.json";
      link.click();
      URL.revokeObjectURL(url);
      return { ...model, feedback: "Replay file downloaded." };
    }
    if (action === "import-file") {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = ".json,application/json";
      picker.onchange = () => {
        const file = picker.files?.[0];
        if (!file) return;
        void file.text().then((raw) => {
          const textarea = document.querySelector<HTMLTextAreaElement>("#monkey-business textarea");
          if (textarea) { textarea.value = raw; textarea.dispatchEvent(new Event("input", { bubbles: true })); }
        }).catch((error) => { fileError = `Could not read replay file: ${error instanceof Error ? error.message : String(error)}`; });
      };
      picker.click();
      return { ...model, feedback: "Choose a replay file, then Load replay to validate and reconstruct it." };
    }
    if (replaySource && ["pace", "burst", "jev", "suspend", "sizes"].includes(action)) {
      return { ...model, feedback: "Finish recorded replay before applying new environment controls. Draft fields remain editable." };
    }
    if (action.startsWith("preset:")) {
      const presets: Record<string, { pace: string; delay: string; outcome: string; bytes: string; feedback: string }> = {
        normal: { pace: "100", delay: "50", outcome: "finding", bytes: "100", feedback: "Normal findings drafted. Start / reset, then Resume to watch advice delivery." },
        slow: { pace: "100", delay: "5000", outcome: "finding", bytes: "100", feedback: "Slow Jev drafted. Start / reset, then Resume to inspect requests waiting for results." },
        failure: { pace: "50", delay: "500", outcome: "backendFailure", bytes: "100", feedback: "Failure → recovery drafted. Start / reset and Resume; choose finding and Apply simulated Jev profile to recover future requests." },
        capacity: { pace: "10", delay: "5000", outcome: "finding", bytes: "1000000", feedback: "Capacity pressure drafted. Start / reset, Resume, then inject a burst and inspect refusal events." },
      };
      return { ...model, ...presets[action.slice(7)] };

    }
    if (action === "speed") return { ...model, appliedSpeed: speedValue(model.speed), feedback: "Playback speed applied. Draft edits do not change playback." };
    if (action === "filter") return { ...model, filter: model.filter === "all" ? "failures" : "all" };
    if (action.startsWith("focus:")) return { ...model, focus: action.slice(6), item: "" };
    if (action === "bookmark") return { ...model, bookmark: model.selected < 0 ? run?.observations.at(-1)?.sequence ?? -1 : model.selected, feedback: "Observation bookmarked for this run." };
    let feedback = model.feedback;
    let playing = model.playing;
    let suspended = model.suspended;
    let replay = model.replay;
    let selected = model.selected;
    let loadedFields: Partial<SimulationModel> = {};
    if (action === "start") {
      const validSpeed = speedValue(model.speed);
      run = createRun({
        seed: number(model.seed, "Seed", 0, 0xffffffff),
        jevDelay: number(model.delay, "Jev delay", 0, 1_000_000),
        outcome: model.outcome as
          | "clear"
          | "finding"
          | "backendFailure"
          | "timeout",
        session: {
          editIntervalMs: number(model.pace, "Edit pace", 1, 1_000_000),
          bytes: number(model.bytes, "Reservation bytes", 1, 1_000_000),
        },
      });
      replayEndpoint = undefined;
      replaySource = undefined;
      totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0 };
      run.subscribe(countFrame);
      loadedFields = { appliedSpeed: validSpeed, bookmark: -1 };
      playing = false;
      suspended = false;
      wallBudget = 0;
      selected = -1;
      feedback =
        "Seeded session started. Paused playback; edit generation is enabled.";
    } else if (action === "load") {
      const inputs: Replay = JSON.parse(model.replay);
      number(
        String(inputs.endpoint.eventCount),
        "Replay endpoint events",
        0,
        100_000,
      );
      number(
        String(inputs.endpoint.now),
        "Replay endpoint time",
        0,
        Number.MAX_SAFE_INTEGER,
      );
      const previousTotals = totals;
      totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0 };
      let restored;
      try { restored = restoreReplay(inputs, countFrame); } catch (error) { totals = previousTotals; throw error; }
      run = restored;
      replayEndpoint = undefined;
      replaySource = undefined;
      playing = false;
      selected = -1;
      const latest = <Kind extends Control["kind"]>(kind: Kind) =>
        inputs.controls
          .map((entry) => entry.control)
          .findLast(
            (control): control is Extract<Control, { kind: Kind }> =>
              control.kind === kind,
          );
      suspended = latest("suspendArrivals")?.suspended === true;
      loadedFields = {
        bookmark: (inputs as Replay & { dashboard?: { bookmark?: number } }).dashboard?.bookmark ?? -1,
        seed: String(inputs.config.seed ?? 1),
        pace: String(
          latest("editPace")?.intervalMs ??
            inputs.config.session?.editIntervalMs ??
            100,
        ),
        bytes: String(
          latest("sizes")?.reservationBytes ??
            inputs.config.session?.bytes ??
            100,
        ),
        delay: String(
          latest("jevProfile")?.delayMs ?? inputs.config.jevDelay ?? 5,
        ),
        outcome: String(
          latest("jevProfile")?.outcome ?? inputs.config.outcome ?? "finding",
        ),
      };
      wallBudget = 0;
      feedback =
        "Replay reconstructed from initial inputs and recorded controls. Paused at the recorded endpoint.";
    } else {
      if (!run) throw new Error("Start or load a run first.");
      switch (action) {
        case "step": {
          playing = false;
          const observation = run.step();
          const completed = completeReplay();
          feedback = completed ? "Replay reached its exact recorded endpoint." : observation
            ? "One checked transition advanced."
            : "No pending synthetic events. Change controls or reset to continue.";
          selected = -1;
          break;
        }
        case "play":
          selected = -1;
          playing = !playing;
          wallBudget = 0;
          feedback = playing
            ? "Playback running."
            : "Playback paused. Future edit generation is unchanged.";
          break;
        case "pace":
          run.applyControl({
            kind: "editPace",
            intervalMs: number(model.pace, "Edit pace", 1, 1_000_000),
          });
          feedback = "Future edit pace updated at this virtual boundary.";
          break;
        case "burst":
          run.applyControl({
            kind: "burst",
            count: number(model.burst, "Burst count", 1, 100),
          });
          feedback = "Bounded edit burst recorded.";
          break;
        case "jev": {
          if (
            !["clear", "finding", "backendFailure", "timeout"].includes(
              model.outcome,
            )
          )
            throw new Error("Choose a supported synthetic Jev outcome.");
          run.applyControl({
            kind: "jevProfile",
            delayMs: number(model.delay, "Jev delay", 0, 1_000_000),
            outcome: model.outcome as
              | "clear"
              | "finding"
              | "backendFailure"
              | "timeout",
          });
          feedback =
            "Simulated Jev profile updated for new requests; existing completion times stay fixed.";
          break;
        }
        case "suspend":
          suspended = !suspended;
          run.applyControl({ kind: "suspendArrivals", suspended });
          feedback = suspended
            ? "Future edits suspended. Existing synthetic work can settle."
            : "Future edit generation resumed.";
          break;
        case "sizes":
          run.applyControl({
            kind: "sizes",
            reservationBytes: number(
              model.bytes,
              "Reservation bytes",
              1,
              1_000_000,
            ),
            reviewUnitBytes: [
              number(model.bytes, "Reservation bytes", 1, 1_000_000),
            ],
          });
          feedback = "Synthetic reservation facts updated for future edits.";
          break;
        case "export":
          replay = JSON.stringify(exported(), null, 2);
          feedback =
            "Replay inputs exported below; copy JSON to a fresh dashboard run.";
          break;
        default:
          if (action.startsWith("inspect:")) { selected = Number(action.slice(8)); playing = false; }
          if (["previous", "next", "latest", "from-start", "go-bookmark"].includes(action)) {
            const items = run.observations;
            const index = selected < 0 ? items.length - 1 : items.findIndex((item) => item.sequence === selected);
            selected = action === "latest" ? -1 : action === "from-start" ? items[0]?.sequence ?? -1 : action === "go-bookmark" ? model.bookmark : items[Math.max(0, Math.min(items.length - 1, index + (action === "previous" ? -1 : 1)))]?.sequence ?? -1;
            playing = false;
          }
      }
    }
    return {
      ...model,
      ...loadedFields,
      playing,
      suspended: run?.exportReplay().controls.findLast((entry) => entry.control.kind === "suspendArrivals")?.control.kind === "suspendArrivals" ? (run.exportReplay().controls.findLast((entry) => entry.control.kind === "suspendArrivals")!.control as Extract<Control, { kind: "suspendArrivals" }>).suspended : suspended,
      replay,
      selected,
      feedback,
      applied: run ? JSON.stringify({ initial: run.exportReplay().config, controls: run.exportReplay().controls.map((entry) => ({ time: entry.time, ...entry.control })) }, null, 2) : model.applied,
      revision: model.revision + 1,
    };
  } catch (error) {
    return {
      ...model,
      playing: error instanceof InputError || ["load", "start"].includes(action) ? model.playing : false,
      feedback: `Cannot apply:  ${error instanceof Error ? error.message : String(error)}`,
      revision: model.revision + 1,
    };
  }
};
export const tickSimulation = (
  model: SimulationModel,
  deltaMs: number,
): SimulationModel => {
  if (fileError) { const feedback = fileError; fileError = undefined; return { ...model, feedback }; }
  if (!model.playing || !run) return model;
  try {
    wallBudget +=
      Math.min(deltaMs, 100) * model.appliedSpeed;
    if (wallBudget < 50) return model;
    const beforeTime = run.now;
    const result = run.advance({
      untilTime: beforeTime + Math.floor(wallBudget),
      maxEvents: replayEndpoint ? Math.min(100, replayEndpoint.eventCount - run.eventCount) : 100,
    });
    // Empty windows leave the virtual clock at the last event. Carry that
    // budget forward; an event-limited batch also preserves its unspent time.
    wallBudget =
      result.reason === "idle"
        ? 0
        : Math.max(0, wallBudget - (result.now - beforeTime));
    const completed = completeReplay();
    return {
      ...model,
      selected: -1,
      suspended: (run.exportReplay().controls.findLast((entry) => entry.control.kind === "suspendArrivals")?.control as Extract<Control, { kind: "suspendArrivals" }> | undefined)?.suspended ?? model.suspended,
      revision: model.revision + 1,
      playing: !completed && result.reason !== "idle" && (!replayEndpoint || run.eventCount < replayEndpoint.eventCount),
      feedback: completed ? "Replay reached its exact recorded endpoint." : model.feedback.startsWith("Cannot apply:") ? model.feedback :
        result.reason === "idle"
          ? "No pending events; playback paused."
          : `Playback advanced (${result.reason}).`,
    };
  } catch (error) {
    return {
      ...model,
      playing: false,
      feedback: `Run error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};
export const simulationView = <Message>(
  model: SimulationModel,
  h: HtmlBuilder<Message>,
  action: (action: string) => Message,
  changed: (field: string, raw: string) => Message,
) => {
  const input = (field: string, label: string, value: string) =>
    h.label(
      [],
      [
        label,
        h.input([
          h.Type("text"),
          h.Value(value),
          h.OnInput((raw) => changed(field, raw)),
        ]),
      ],
    );
  const button = (label: string, name: string) =>
    h.button([h.Type("button"), h.OnClick(action(name))], [label]);
  const observations = run?.observations ?? [];
  const activeReplay = run?.exportReplay();
  const latestControl = <Kind extends Control["kind"]>(kind: Kind) => activeReplay?.controls.map((entry) => entry.control).findLast((control): control is Extract<Control, { kind: Kind }> => control.kind === kind);
  const current =
    model.selected < 0
      ? observations.at(-1)
      : observations.find((item) => item.sequence === model.selected);
  const last: ReplayStep | undefined = current
    ? {
        event: current.event,
        commands: current.commands,
        before: current.before,
        after: current.after,
        rejection: current.rejection,
        origin: "manual",
      }
    : undefined;
  return h.section(
    [h.Id("monkey-business"), h.Class("chart-panel simulation-panel")],
    [
      h.h2([], ["Monkey-business · seeded simulation"]),
      h.p(
        [],
        [
          "One source-free synthetic agent; simulated Jev observations and effects. Playback pause, suspended future edits, agent finish attempts and Hapsland finish allowance are separate events.",
        ],
      ),
      h.div(
        [h.Class("simulation-controls")],
        [
          button("Normal findings scenario", "preset:normal"),
          button("Slow Jev scenario", "preset:slow"),
          button("Failure → recovery scenario", "preset:failure"),
          button("Capacity pressure scenario", "preset:capacity"),
          input("seed", "Seed", model.seed),
          button("Start / reset", "start"),
          button(model.playing ? "Pause" : "Resume", "play"),
          button("Single step", "step"),
          input("speed", "Playback speed (virtual ms / wall ms)", model.speed),
          button("Apply playback speed", "speed"),
          h.span([h.Class("applied-speed")], [`Active speed: ${model.appliedSpeed}×`]),
        ],
      ),
      h.div(
        [h.Class("simulation-controls")],
        [
          input("pace", "Edit interval (virtual ms)", model.pace),
          button("Apply edit pace", "pace"),
          input("burst", "Burst count (1–100)", model.burst),
          button("Inject edit burst", "burst"),
          button(
            model.suspended
              ? "Resume edit generation"
              : "Suspend edit generation",
            "suspend",
          ),
        ],
      ),
      h.div(
        [h.Class("simulation-controls")],
        [
          input("delay", "Simulated Jev delay (virtual ms)", model.delay),
          h.label(
            [],
            [
              "Simulated Jev outcome",
              h.select(
                [
                  h.AriaLabel("Simulated Jev outcome"),
                  h.Value(model.outcome),
                  h.OnChange((raw) => changed("outcome", raw)),
                ],
                ["clear", "finding", "backendFailure", "timeout"].map((value) =>
                  h.option([h.Value(value)], [value]),
                ),
              ),
            ],
          ),
          button("Apply simulated Jev profile", "jev"),
          input("bytes", "Reservation bytes per edit", model.bytes),
          button("Apply reservation size", "sizes"),
        ],
      ),
      h.p(
        [h.Class("caveat")],
        [
          "Reservation bytes exercise checked capacity admission; they do not measure source capture, evidence trees or encoded output. Native filesystem capture and multi-agent contention are unsupported. Synthetic delay changes affect new requests only.",
        ],
      ),
      h.p(
        [h.Class("simulation-status"), h.Role("status")],
        [
          `${model.playing ? "Running" : "Paused"} · virtual time ${run?.now ?? 0} ms · edits ${model.suspended ? "suspended" : "enabled"} · ${model.feedback}`,
        ],
      ),
      h.p([h.Class("simulation-inspection")], [model.selected < 0 ? "Viewing latest observation" : `Inspecting event ${current?.sequence ?? "unavailable"} at ${current?.time ?? 0} ms; run endpoint ${run?.now ?? 0} ms. Playback paused. Applied controls affect the run endpoint, not this historical event.`]),
      h.div([h.Class("simulation-controls")], [button("Previous event", "previous"), button("Next event", "next"), button("Return to latest", "latest"), button("Replay from start", "replay-start"), button("Inspect oldest retained event", "from-start"), button("Bookmark event", "bookmark"), button("Go to bookmark", "go-bookmark")]),
      h.p([h.Class("simulation-outcomes")], [`Run outcomes: ${totals.checked} checked events · ${totals.admitted} observations admitted · ${totals.refused} refusals · ${totals.failed} failures/timeouts · ${totals.advice} delivered advice batches. ${run && model.suspended && !run.projection.work.some((work) => work.kind !== "pendingFinding") && run.projection.dispatch.requests.length === 0 && run.projection.collection.leases.length === 0 && !run.projection.delivery.slots.some((slot) => ["reserved", "authorized", "uncertain"].includes(slot.phase)) && !run.projection.delivery.submissions.batches.some((batch) => ["reserved", "authorized", "uncertain"].includes(batch.phase)) ? `Transient work settled; ${run.projection.collection.ready.length} retained advice records; arrivals suspended.` : "Work or future arrivals remain."}`]),
      h.p([h.Class("simulation-active-controls")], [activeReplay ? `Active environment: edit interval ${latestControl("editPace")?.intervalMs ?? activeReplay.config.session?.editIntervalMs ?? 100} ms · Jev delay ${latestControl("jevProfile")?.delayMs ?? activeReplay.config.jevDelay ?? 5} ms · outcome ${latestControl("jevProfile")?.outcome ?? activeReplay.config.outcome ?? "finding"} · reservation ${latestControl("sizes")?.reservationBytes ?? activeReplay.config.session?.bytes ?? 100} bytes. Draft fields require Apply.` : "Start a run to apply environment settings."]),
      h.ul([h.Class("simulation-control-markers")], (activeReplay?.controls ?? []).slice(-20).map((entry) => h.li([], [`Control at ${entry.time} ms / event boundary ${entry.boundary}: ${JSON.stringify(entry.control)}`]))),
      h.details([], [h.summary([], ["Applied control timeline (draft fields apply only when submitted)"]), h.pre([], [model.applied])]),
      h.details([], [h.summary([], ["Inspect a diagram stage by keyboard"]), h.select([h.AriaLabel("Diagram stage"), h.Value(model.stage), h.OnChange((raw) => changed("stage", raw))], PLACE_ORDER.map((place) => h.option([h.Value(place)], [SQUARES[place].title]))), button("Inspect selected stage", "focus-stage")]),
      ...(model.focus ? [button("Clear lifecycle filter", "focus:")] : []),
      ...(model.focus && current ? [h.details([h.Open(true)], [h.summary([], [`Focused lifecycle and state: ${SQUARES[model.focus as keyof typeof SQUARES]?.title}`]), h.p([], [SQUARES[model.focus as keyof typeof SQUARES]?.detail(current.after) ?? ""]), h.ul([], locateFlow(current.after).filter((record) => record.stage === model.focus).map((record) => h.li([], [button(record.description, `item:${record.key}`)]))), h.p([], [model.item ? `Following ${model.item}; history is filtered to this identity.` : "Select a record to follow its lifecycle."])])] : []),
      ...(run
        ? [productionFlowView(h, current?.after ?? run.projection, last, false, (place) => action(`focus:${place}`))]
        : []),
      h.details(
        [h.Class("simulation-details"), h.Open(true)],
        [
          h.summary(
            [],
            ["Checked event, ordered commands, refusals and synthetic effects"],
          ),
          h.p(
            [],
            [
              current?.event.kind === "stopPolled"
                ? "Agent finish attempt supplied to Hapsland."
                : current?.commands.some((command) =>
                      command.kind.startsWith("finishAllowed"),
                    )
                  ? "Hapsland allows this agent finish attempt."
                  : "Synthetic environment facts and checked product outcomes are shown separately below.",
            ],
          ),
          h.pre(
            [],
            [
              current
                ? JSON.stringify(current, null, 2)
                : "No checked transition yet.",
            ],
          ),
        ],
      ),
      h.p(
        [],
        [
          "Diagram and details follow the selected observation. Last 1000 observations are retained; discarded display history does not remove replay inputs or change simulation outcomes. Transitions without diagram movement remain inspectable. Loading reproduces the recorded endpoint; intermediate branching is unsupported.",
        ],
      ),
      button(model.filter === "all" ? "Show failures only" : "Show all events", "filter"),
      h.div(
        [h.Class("simulation-history")],
        observations
          .filter((item) => !model.item || [...locateFlow(item.before), ...locateFlow(item.after)].some((record) => record.key === model.item))
          .filter((item) => !model.focus || model.item || projectFlowStep({ event: item.event, commands: item.commands, before: item.before, after: item.after, rejection: item.rejection }).changedStages.includes(model.focus as (typeof PLACE_ORDER)[number]))
          .filter((item) => model.filter === "all" || item.rejection || item.commands.some((command) => /Refused$|Denied$|Unavailable$/.test(command.kind)) || /fail|timeout/i.test(JSON.stringify(item.event)))
          .slice(-100)
          .map((item) =>
            h.button([h.Type("button"), h.Class(item.sequence === current?.sequence ? "selected" : ""), h.OnClick(action(`inspect:${item.sequence}`))], [
              `${item.sequence}. ${item.time} ms · ${item.event.kind}${item.rejection ? ` · refusal: ${item.rejection}` : ""}`,
            ]),
          ),
      ),
      h.label([], ["Retained event timeline", h.input([h.Type("range"), h.AriaLabel("Retained event timeline"), h.Min(String(observations[0]?.sequence ?? 0)), h.Max(String(observations.at(-1)?.sequence ?? 0)), h.Value(String(current?.sequence ?? 0)), h.OnInput((raw) => action(`inspect:${raw}`))])]),
      h.p(
        [],
        [
          "History buttons show the most recent 100 transitions; exported replay retains the full required input/control timeline.",
        ],
      ),
      h.div(
        [h.Class("simulation-controls")],
        [button("Export replay", "export"), button("Download replay file", "download"), button("Import replay file", "import-file"), button("Load replay", "load")],
      ),
      h.label(
        [],
        [
          "Replay JSON",
          h.textarea([
            h.AriaLabel("Replay JSON"),
            h.Value(model.replay),
            h.OnInput((raw) => changed("replay", raw)),
          ]),
        ],
      ),
    ],
  );
};
