import { Schema } from "effect";
import type { HtmlBuilder } from "foldkit/html";
import {
  createRun,
  replayRun,
  type Replay,
} from "../../monkey-business/src/index";
import type { ReplayStep } from "./canonical-replay";
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
  playing: false,
  suspended: false,
  revision: 0,
  selected: -1,
  feedback: "Start a seeded source-free session. Jev effects are simulated.",
};
let run: ReturnType<typeof createRun> | undefined;
let wallBudget = 0;
const number = (raw: string, name: string, min: number, max: number) => {
  const value = Number(raw);
  if (!raw.trim() || !Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
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
    let feedback = model.feedback;
    let playing = model.playing;
    let suspended = model.suspended;
    let replay = model.replay;
    let selected = model.selected;
    let loadedFields: Partial<SimulationModel> = {};
    if (action === "start") {
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
      playing = false;
      suspended = false;
      wallBudget = 0;
      selected = -1;
      feedback =
        "Seeded session started. Paused playback; edit generation is enabled.";
    } else if (action === "load") {
      const inputs: Replay = JSON.parse(model.replay);
      const restored = replayRun(inputs);
      restored.advance({
        maxEvents: number(
          String(inputs.endpoint.eventCount),
          "Replay endpoint events",
          0,
          100_000,
        ),
        untilTime: number(
          String(inputs.endpoint.now),
          "Replay endpoint time",
          0,
          Number.MAX_SAFE_INTEGER,
        ),
      });
      run = restored;
      playing = false;
      selected = -1;
      suspended =
        inputs.controls
          .filter((entry) => entry.control.kind === "suspendArrivals")
          .at(-1)?.control.suspended === true;
      const latest = (kind: string) =>
        inputs.controls.filter((entry) => entry.control.kind === kind).at(-1)
          ?.control;
      loadedFields = {
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
          feedback = observation
            ? "One checked transition advanced."
            : "No pending synthetic events. Change controls or reset to continue.";
          selected = -1;
          break;
        }
        case "play":
          number(model.speed, "Playback speed", 1, 1000);
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
          replay = JSON.stringify(run.exportReplay(), null, 2);
          feedback =
            "Replay inputs exported below; copy JSON to a fresh dashboard run.";
          break;
        default:
          if (action.startsWith("inspect:")) selected = Number(action.slice(8));
      }
    }
    return {
      ...model,
      ...loadedFields,
      playing,
      suspended,
      replay,
      selected,
      feedback,
      revision: model.revision + 1,
    };
  } catch (error) {
    return {
      ...model,
      playing: false,
      feedback: `Run error: ${error instanceof Error ? error.message : String(error)}`,
      revision: model.revision + 1,
    };
  }
};
export const tickSimulation = (
  model: SimulationModel,
  deltaMs: number,
): SimulationModel => {
  if (!model.playing || !run) return model;
  try {
    wallBudget +=
      Math.min(deltaMs, 100) * number(model.speed, "Playback speed", 1, 1000);
    if (wallBudget < 50) return model;
    const result = run.advance({
      untilTime: run.now + Math.floor(wallBudget),
      maxEvents: 100,
    });
    wallBudget = 0;
    return {
      ...model,
      selected: -1,
      revision: model.revision + 1,
      playing: result.reason !== "idle",
      feedback:
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
          h.OnChange((raw) => changed(field, raw)),
        ]),
      ],
    );
  const button = (label: string, name: string) =>
    h.button([h.Type("button"), h.OnClick(action(name))], [label]);
  const observations = run?.observations ?? [];
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
          input("seed", "Seed", model.seed),
          button("Start / reset", "start"),
          button(model.playing ? "Pause" : "Resume", "play"),
          button("Single step", "step"),
          input("speed", "Playback speed (virtual ms / wall ms)", model.speed),
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
      ...(run
        ? [productionFlowView(h, current?.after ?? run.projection, last, false)]
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
      h.div(
        [h.Class("simulation-history")],
        observations
          .slice(-100)
          .map((item) =>
            button(
              `${item.sequence}. ${item.time} ms · ${item.event.kind}${item.rejection ? ` · refusal: ${item.rejection}` : ""}`,
              `inspect:${item.sequence}`,
            ),
          ),
      ),
      h.p(
        [],
        [
          "History buttons show the most recent 100 transitions; exported replay retains the full required input/control timeline.",
        ],
      ),
      h.div(
        [h.Class("simulation-controls")],
        [button("Export replay", "export"), button("Load replay", "load")],
      ),
      h.label(
        [],
        [
          "Replay JSON",
          h.textarea([
            h.AriaLabel("Replay JSON"),
            h.Value(model.replay),
            h.OnChange((raw) => changed("replay", raw)),
          ]),
        ],
      ),
    ],
  );
};
