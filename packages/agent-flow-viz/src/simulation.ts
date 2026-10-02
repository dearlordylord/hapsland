import { demoResourceLimits } from "../../monkey-business/src/index";
import { stageResourceDetails } from "./resource-details";
import { preparationDetails } from "./preparation-details";
import { preparationSnapshot } from "./preparation-mini";
import { reviewCapacityView } from "./review-capacity-view";
import { locateFlow, numberRecords, projectFlowStep } from "@hapsland/agent-flow-projection";
import { Schema } from "effect";
import type { HtmlBuilder } from "foldkit/html";
import {
  createRun,
  restoreReplay,
  replayRun,
  type Replay,
  type Control,
  type Observation,
  DEFAULT_FILE_TREE_PROFILE,
  FILE_TREE_LABELS,
  validateFileTreeProfile,
  type FileTreeProfile,
  DEFAULT_OUTCOME_WEIGHTS,
  JEV_OUTCOME_ORDER,
  normalizeOutcomeWeights,
  type OutcomeWeights,
} from "../../monkey-business/src/index";
import type { ReplayStep } from "./canonical-replay";
import { SQUARES, PLACE_ORDER } from "./production-flow-presentation";
import { productionFlowView } from "./production-flow-view";

export const SimulationModel = Schema.Struct({
  agentId: Schema.String,
  agentCount: Schema.String,
  resourceScenario: Schema.String,
  resourceGroup: Schema.String,
  resourceRound: Schema.String,
  seed: Schema.String,
  pace: Schema.String,
  editDuration: Schema.String,
  variation: Schema.String,
  editsPerTask: Schema.String,
  taskPause: Schema.String,
  adviceResponse: Schema.String,
  repairDelay: Schema.String,
  draftEpoch: Schema.Number,
  burst: Schema.String,
  delay: Schema.String,
  weightNeverSent: Schema.String,
  weightFinding: Schema.String,
  weightClear: Schema.String,
  weightBackendFailure: Schema.String,
  weightTimeout: Schema.String,
  weightInterrupted: Schema.String,

  bytes: Schema.String,
  treeMinFiles: Schema.String,
  treeMaxFiles: Schema.String,
  treeMaxImports: Schema.String,
  treeMaxDepth: Schema.String,
  treeDeniedPercent: Schema.String,
  treeMinSourceBytes: Schema.String,
  treeMaxSourceBytes: Schema.String,
  treeMinTreeBytes: Schema.String,
  treeMaxTreeBytes: Schema.String,

  currentWork: Schema.String,
  credentialReady: Schema.String,
  credentialGeneration: Schema.String,
  sourceReadable: Schema.String,
  outputOutcome: Schema.String,
  outputDelay: Schema.String,
  outputLease: Schema.String,
  speed: Schema.String,
  replay: Schema.String,
  appliedSpeed: Schema.Number,
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
  agentId: "agent-1",
  agentCount: "1",
  resourceScenario: "none",
  resourceGroup: "",
  resourceRound: "",
  seed: "7",
  pace: "100",
  editDuration: "1",
  variation: "15",
  editsPerTask: "5",
  taskPause: "500",
  adviceResponse: "ignore",
  repairDelay: "300",
  draftEpoch: 0,
  burst: "5",
  delay: "50",
  weightNeverSent: String(DEFAULT_OUTCOME_WEIGHTS.neverSent),
  weightFinding: String(DEFAULT_OUTCOME_WEIGHTS.finding),
  weightClear: String(DEFAULT_OUTCOME_WEIGHTS.clear),
  weightBackendFailure: String(DEFAULT_OUTCOME_WEIGHTS.backendFailure),
  weightTimeout: String(DEFAULT_OUTCOME_WEIGHTS.timeout),
  weightInterrupted: String(DEFAULT_OUTCOME_WEIGHTS.interrupted),
  bytes: "100",
  treeMinFiles: String(DEFAULT_FILE_TREE_PROFILE.minFiles),
  treeMaxFiles: String(DEFAULT_FILE_TREE_PROFILE.maxFiles),
  treeMaxImports: String(DEFAULT_FILE_TREE_PROFILE.maxImports),
  treeMaxDepth: String(DEFAULT_FILE_TREE_PROFILE.maxDepth),
  treeDeniedPercent: String(DEFAULT_FILE_TREE_PROFILE.deniedPercent),
  treeMinSourceBytes: String(DEFAULT_FILE_TREE_PROFILE.minSourceBytes),
  treeMaxSourceBytes: String(DEFAULT_FILE_TREE_PROFILE.maxSourceBytes),
  treeMinTreeBytes: String(DEFAULT_FILE_TREE_PROFILE.minTreeBytes),
  treeMaxTreeBytes: String(DEFAULT_FILE_TREE_PROFILE.maxTreeBytes),

  currentWork: "current",
  credentialReady: "ready",
  credentialGeneration: "1",
  sourceReadable: "readable",
  outputOutcome: "certain",
  outputDelay: "1",
  outputLease: "1000",
  speed: "10",
  replay: "",
  appliedSpeed: 10,
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
let fileReadState: { error?: string } = {};
let replayEndpoint: Replay["endpoint"] | undefined;
let replaySource: Replay | undefined;
const completeReplay = () => {
  if (run && replaySource && run.eventCount >= replaySource.endpoint.eventCount) {
    totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0, uncertain: 0, released: 0 };
    run = restoreReplay(replaySource, countFrame);
    fileReadState = {};
    replayEndpoint = undefined;
    replaySource = undefined;
    return true;
  }
  return false;
};
class InputError extends Error {}
const treeFields = {
  minFiles: "treeMinFiles",
  maxFiles: "treeMaxFiles",
  maxImports: "treeMaxImports",
  maxDepth: "treeMaxDepth",
  deniedPercent: "treeDeniedPercent",
  minSourceBytes: "treeMinSourceBytes",
  maxSourceBytes: "treeMaxSourceBytes",
  minTreeBytes: "treeMinTreeBytes",
  maxTreeBytes: "treeMaxTreeBytes",
} as const;
const treeDrafts = (profile: FileTreeProfile) => Object.fromEntries(Object.entries(treeFields).map(([key, field]) => [field, String(profile[key as keyof FileTreeProfile])])) as Pick<SimulationModel, typeof treeFields[keyof typeof treeFields]>;
const treeProfile = (model: SimulationModel): FileTreeProfile => {
  try {
    return validateFileTreeProfile(Object.fromEntries(Object.entries(treeFields).map(([key, field]) => [key, number(model[field], FILE_TREE_LABELS[key as keyof FileTreeProfile], 0, 1048576)])) as FileTreeProfile);
  } catch (error) { throw new InputError(error instanceof Error ? error.message : String(error)); }
};
const treeSummary = (profile: FileTreeProfile) => `${profile.minFiles}–${profile.maxFiles} files/artifact · up to ${profile.maxImports} imports/file · depth ≤ ${profile.maxDepth} · ${profile.deniedPercent}% denied`;
const recordIdentity = (key: string) => {
  const [kind, id] = key.split(":");
  return `${["ready-advice", "lease-advice", "batch"].includes(kind) ? "advice" : ["work", "dispatch"].includes(kind) ? "operation" : kind}:${id}`;
};
export const followsRecord = (frame: Observation, identity: string) => {
  const before = locateFlow(frame.before).filter((record) => recordIdentity(record.key) === identity);
  const after = locateFlow(frame.after).filter((record) => recordIdentity(record.key) === identity);
  if (JSON.stringify(before) !== JSON.stringify(after)) return true;
  const [kind, id] = identity.split(":");
  const field = kind === "operation" ? "operation" : kind === "slot" ? "group" : kind;
  return field in frame.event && String((frame.event as unknown as Record<string, unknown>)[field]) === id;
};
let totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0, uncertain: 0, released: 0 };
const countFrame = (item: Observation) => {
  totals.checked++;
  totals.admitted += item.commands.filter((command) => command.kind === "observationAdmitted").length;
  totals.refused += item.rejection ? 1 : item.commands.filter((command) => /Refused$|Denied$|Unavailable$/.test(command.kind)).length;
  if (/fail|timeout/i.test(JSON.stringify(item.event))) totals.failed++;
  if (item.event.kind === "submissionTerminal" && item.commands.some((command) => command.kind === "submissionRecorded")) {
    if (item.event.certain) totals.advice++;
    else totals.uncertain++;
  }
  if (item.event.kind === "finishTerminal" && item.commands.some((command) => command.kind === "finishRecorded")) {
    const token = item.event.token;
    const changed = item.after.delivery.submissions.batches.filter((batch) =>
      batch.token === token &&
      item.before.delivery.submissions.batches.some((prior) =>
        prior.advice === batch.advice && prior.token === batch.token && prior.phase !== batch.phase)).length;
    if (item.event.outcome === "acknowledged") totals.advice += changed;
    else if (item.event.outcome === "unknown") totals.uncertain += changed;
  }
  totals.released += item.commands.filter((command) => command.kind === "submissionReleased").length;
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
const weightField = (outcome: keyof OutcomeWeights) => `weight${outcome[0].toUpperCase()}${outcome.slice(1)}`;
const singleOutcomeWeights = (selected: keyof OutcomeWeights): OutcomeWeights => Object.fromEntries(JEV_OUTCOME_ORDER.map((outcome) => [outcome, outcome === selected ? 100 : 0])) as unknown as OutcomeWeights;
const weightDrafts = (weights: OutcomeWeights): Partial<SimulationModel> => Object.fromEntries(JEV_OUTCOME_ORDER.map((outcome) => [weightField(outcome), String(weights[outcome])]));
const rawWeights = (model: SimulationModel): OutcomeWeights => Object.fromEntries(JEV_OUTCOME_ORDER.map((outcome) => [outcome, Number((model as unknown as Record<string, string>)[weightField(outcome)])])) as unknown as OutcomeWeights;
const draftWeights = (model: SimulationModel): OutcomeWeights => {
  const weights = rawWeights(model);
  try { normalizeOutcomeWeights(weights); } catch (error) { throw new InputError(error instanceof Error ? error.message : String(error)); }
  return weights;
};
const appliedWeights = (replay: Replay): OutcomeWeights => {
  let weights = replay.config.outcomeWeights ?? (replay.config.outcome ? singleOutcomeWeights(replay.config.outcome) : DEFAULT_OUTCOME_WEIGHTS);
  for (const { control } of replay.controls) if (control.kind === "jevProfile") {
    if (control.outcomeWeights) weights = control.outcomeWeights;
    else if (control.outcome) weights = singleOutcomeWeights(control.outcome);
  }
  return weights;
};
const outcomeNames: Record<keyof OutcomeWeights, string> = { neverSent: "Never sent", finding: "Finding", clear: "No finding (clear)", backendFailure: "Backend failure", timeout: "Timeout", interrupted: "Interrupted" };
const mixSummary = (weights: OutcomeWeights) => {
  const probabilities = normalizeOutcomeWeights(weights);
  return JEV_OUTCOME_ORDER.filter((outcome) => probabilities[outcome] > 0).map((outcome) => `${outcomeNames[outcome]} ${(probabilities[outcome] * 100).toFixed(1)}%`).join(" · ");
};
const environmentFacts = (model: SimulationModel) => {
  if (!["current", "stale"].includes(model.currentWork) || !["ready", "unavailable"].includes(model.credentialReady)) throw new InputError("Choose supported freshness and credential facts.");
  if (!["readable", "unreadable"].includes(model.sourceReadable)) throw new InputError("Choose a supported source readability fact.");
  return { currentWork: model.currentWork === "current", credentialReady: model.credentialReady === "ready", credentialGeneration: number(model.credentialGeneration, "Credential generation", 1, 1_000_000), sourceReadable: model.sourceReadable === "readable" };
};
const outputProfile = (model: SimulationModel) => {
  if (!["certain", "uncertain", "failed"].includes(model.outputOutcome)) throw new InputError("Choose a supported host output outcome.");
  return { outcome: model.outputOutcome as "certain" | "uncertain" | "failed", delayMs: number(model.outputDelay, "Host output delay", 0, 1_000_000), leaseMs: number(model.outputLease, "Delivery lease lifetime", 1, 1_000_000) };
};
const adviceResponse = (model: SimulationModel): "ignore" | "noAction" | "promptRepair" | "delayedRepair" => {
  switch (model.adviceResponse) {
    case "ignore": case "noAction": case "promptRepair": case "delayedRepair": return model.adviceResponse;
    default: throw new InputError("Choose a supported advice response.");
  }
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
      "editDuration",
      "variation",
      "editsPerTask",
      "taskPause",
      "adviceResponse",
      "repairDelay",
      "burst",
      "delay",
      "weightNeverSent",
      "weightFinding",
      "weightClear",
      "weightBackendFailure",
      "weightTimeout",
      "weightInterrupted",
      "bytes",
      "treeMinFiles",
      "treeMaxFiles",
      "treeMaxImports",
      "treeMaxDepth",
      "treeDeniedPercent",
      "treeMinSourceBytes",
      "treeMaxSourceBytes",
      "treeMinTreeBytes",
      "treeMaxTreeBytes",

      "currentWork",
      "credentialReady",
      "credentialGeneration",
      "sourceReadable",
      "outputOutcome",
      "outputDelay",
      "outputLease",
      "speed",
      "replay",
      "stage",
      "resourceScenario",
      "resourceGroup",
      "resourceRound",
    ].includes(field)
  )
    return model;
  const draft = { ...model, [field]: raw };
  if (!run || field !== "delay" && !JEV_OUTCOME_ORDER.some((outcome) => weightField(outcome) === field)) return draft;
  if (replaySource) return { ...draft, feedback: "Cannot update: finish recorded replay before changing live Jev settings." };
  try {
    const active = run.exportReplay();
    const profile = [...active.controls].reverse().find((entry) => entry.control.kind === "jevProfile")?.control;
    run.applyControl({ kind: "jevProfile", delayMs: field === "delay" ? number(raw, "Jev delay", 0, 1_000_000) : profile?.kind === "jevProfile" ? profile.delayMs : active.config.jevDelay ?? 5,
      outcomeWeights: field === "delay" ? appliedWeights(active) : draftWeights(draft) });
    return { ...draft, revision: model.revision + 1, feedback: "Jev settings updated for new requests." };
  } catch (error) {
    return { ...draft, playing: error instanceof InputError ? model.playing : false, feedback: `${error instanceof InputError ? "Cannot update" : "Run error"}: ${error instanceof Error ? error.message : String(error)}` };
  }
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
      fileReadState = {};
      totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0, uncertain: 0, released: 0 };
      run.subscribe(countFrame);
      replayEndpoint = inputs.endpoint;
      replaySource = inputs;
      wallBudget = 0;
      return { ...model, selected: -1, playing: false, suspended: false, revision: model.revision + 1, feedback: "Replay reset to initial inputs. Resume or Single step to replay recorded controls to its endpoint." };
    }
    if (action === "trees:balanced" || action === "trees:pressure") return {
      ...model, draftEpoch: model.draftEpoch + 1, ...treeDrafts(action === "trees:balanced" ? DEFAULT_FILE_TREE_PROFILE : {
        ...DEFAULT_FILE_TREE_PROFILE, minFiles: 10, maxFiles: 16, maxDepth: 4, minTreeBytes: 2048, maxTreeBytes: 5120,
      }), feedback: "Tree generation drafted. Start / reset or Apply to future preparations to use it.",
    };
    if (action.startsWith("item:")) return { ...model, item: action.slice(5) };
    if (action === "focus-stage") return { ...model, focus: model.focus === model.stage ? "" : model.stage, item: "" };
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
      const ownerRun = run;
      const ownerLabel = "Resident simulation controls";
      const ownerPanel = document.querySelector(`[aria-label="${ownerLabel}"]`);
      const textarea = ownerPanel?.querySelector<HTMLTextAreaElement>("textarea");
      const ownerReadState = fileReadState;
      const stillSelected = () => run === ownerRun && textarea?.isConnected === true && ownerPanel?.getAttribute("aria-label") === ownerLabel;
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = ".json,application/json";
      picker.onchange = () => {
        const file = picker.files?.[0];
        if (!file) return;
        void file.text().then((raw) => {
          if (stillSelected() && textarea) { textarea.value = raw; textarea.dispatchEvent(new Event("input", { bubbles: true })); }
        }).catch((error) => { ownerReadState.error = `Could not read replay file: ${error instanceof Error ? error.message : String(error)}`; });
      };
      picker.click();
      return { ...model, feedback: "Choose a replay file, then Load replay to validate and reconstruct it." };
    }
    if (replaySource && ["pace", "editDuration", "burst", "suspend", "sizes", "environment", "output", "fileTrees"].includes(action)) {
      return { ...model, feedback: "Cannot apply: finish recorded replay before applying new environment controls. Draft fields remain editable." };
    }
    if (action.startsWith("preset:")) {
      const presets: Record<string, Partial<SimulationModel> & { outcome: keyof OutcomeWeights }> = {
        normal: { pace: "100", delay: "50", outcome: "finding", bytes: "100", feedback: "Normal findings drafted. Start / reset, then Resume to watch advice delivery." },
        slow: { pace: "100", delay: "5000", outcome: "finding", bytes: "100", feedback: "Slow Jev drafted. Start / reset, then Resume to inspect requests waiting for results." },
        failure: { pace: "50", delay: "500", outcome: "backendFailure", bytes: "100", feedback: "Failure → recovery drafted. Start / reset and Resume; set Finding weight to 100 and the other weights to zero to recover future requests." },
        stale: { pace: "100", delay: "5000", outcome: "finding", bytes: "100", feedback: "Freshness change drafted. Start / reset and Resume until Jev is waiting; choose stale and Apply environment facts, then inspect settlement without retained advice." },
        credential: { pace: "100", delay: "50", outcome: "finding", bytes: "100", credentialReady: "unavailable", feedback: "Credential unavailable drafted. Start / reset, Resume and inspect refused requests; choose ready and Apply environment facts to recover future requests." },
        uncertain: { pace: "100", delay: "50", outcome: "finding", bytes: "100", outputOutcome: "uncertain", outputDelay: "50", outputLease: "500", feedback: "Uncertain host output drafted. Start / reset and Resume; inspect uncertain delivery and lease recovery. Choose certain and Apply host output profile for future output attempts." },
        source: { pace: "100", delay: "50", outcome: "finding", bytes: "100", sourceReadable: "unreadable", feedback: "Unreadable final source drafted. Start / reset and Resume; inspect candidate revalidation retiring advice before host handoff. Restore readable and Apply environment facts for future candidates." },
        rotation: { pace: "100", delay: "50", outcome: "finding", bytes: "100", feedback: "Credential rotation drafted. Start / reset, Resume until advice is ready; set credential generation 2 and Apply environment facts to invalidate advice authorized under generation 1." },
        expired: { pace: "100", delay: "50", outcome: "finding", bytes: "100", outputOutcome: "certain", outputDelay: "500", outputLease: "50", feedback: "Expired delivery lease drafted. Start / reset and Resume; inspect lease revalidation before delayed output. Apply delay 1 / lease 1000 for future delivery attempts." },
        capacity: { pace: "10", delay: "5000", outcome: "finding", bytes: "1000000", feedback: "Capacity pressure drafted. Start / reset, Resume, then inject a burst and inspect refusal events." },
      };
      const { outcome, ...fields } = presets[action.slice(7)];
      return { ...model, draftEpoch: model.draftEpoch + 1, ...weightDrafts(singleOutcomeWeights(outcome)), currentWork: "current", credentialReady: "ready", credentialGeneration: "1", sourceReadable: "readable", outputOutcome: "certain", outputDelay: "1", outputLease: "1000", ...fields };

    }
    if (action === "speed") return { ...model, appliedSpeed: speedValue(model.speed), feedback: "Playback speed applied. Draft edits do not change playback." };
    if (action === "filter") return { ...model, filter: model.filter === "all" ? "failures" : "all" };
    if (action.startsWith("focus:")) return { ...model, focus: model.focus === action.slice(6) ? "" : action.slice(6), item: "" };
    if (action === "bookmark") return { ...model, bookmark: model.selected < 0 ? run?.observations.at(-1)?.sequence ?? -1 : model.selected, feedback: "Observation bookmarked for this run." };
    let feedback = model.feedback;
    let playing = model.playing;
    let suspended = model.suspended;
    let replay = model.replay;
    let selected = model.selected;
    let loadedFields: Partial<SimulationModel> = {};
    if (action === "start") {
      const validSpeed = speedValue(model.speed);
      const demoLimits = demoResourceLimits(number(model.agentCount, "Agent count", 1, 6));
      run = createRun({
        demoAgentCount: number(model.agentCount, "Agent count", 1, 6),
        // One resident ledger and execution pool serve every independent generator.
        limits: { globalItems: 32, partitionItems: 16, globalBytes: 2000, partitionBytes: 2000 },
        lifecycles: { permits: { adviceeLimit: 16, residentLimit: 64, holdMs: 1 }, collectors: { capacity: 64 }, reuse: { entryLimit: demoLimits.entryLimit, byteLimit: demoLimits.byteLimit }, quietWindowMs: 60000 },
        resourceScenarios: model.resourceScenario === "none" ? undefined : { noticeMaximumKeys: demoLimits.noticeMaximumKeys, notices: model.resourceScenario === "notices", outputFit: model.resourceScenario === "fit" || model.resourceScenario === "oversized", outputBytes: model.resourceScenario === "oversized" ? 10241 : 512 },
        environment: environmentFacts(model),
        outputProfile: outputProfile(model),
        seed: number(model.seed, "Seed", 0, 2 ** 48 - 1),
        jevDelay: number(model.delay, "Jev delay", 0, 1_000_000),
        outcomeWeights: draftWeights(model),
        fileTrees: treeProfile(model),
        sessions: Array.from({ length: number(model.agentCount, "Agent count", 1, 6) }, (_, index) => ({
          agent: `agent-${index + 1}`,
          seed: (number(model.seed, "Seed", 0, 2 ** 48 - 1) + Math.imul(index, 2654435761)) >>> 0,
          editIntervalMs: number(model.pace, "Edit pace", 1, 1_000_000),
          variationMs: number(model.variation, "Edit interval variation", 0, 1_000_000_000),
          editsPerTask: number(model.editsPerTask, "Edits per task", 1, 1024),
          taskPauseMs: number(model.taskPause, "Pause between tasks", 0, 1_000_000_000),
          adviceResponse: adviceResponse(model),
          repairDelayMs: number(model.repairDelay, "Repair response delay", 0, 1_000_000_000),
          editDurationMs: number(model.editDuration, "Simulated edit duration", 0, 1_000_000_000),
          bytes: number(model.bytes, "Reservation bytes", 1, 1_000_000),
        })),
      });
      fileReadState = {};
      replayEndpoint = undefined;
      replaySource = undefined;
      totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0, uncertain: 0, released: 0 };
      run.subscribe(countFrame);
      loadedFields = { appliedSpeed: validSpeed, bookmark: -1, draftEpoch: model.draftEpoch + 1 };
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
      totals = { checked: 0, admitted: 0, refused: 0, failed: 0, advice: 0, uncertain: 0, released: 0 };
      let restored;
      try { restored = restoreReplay(inputs, countFrame); number(String(Math.max(1, restored.agentScopes.length, restored.projection.partitions.length)), "Replay agent count", 1, 6); } catch (error) { totals = previousTotals; throw error; }
      run = restored;
      fileReadState = {};
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
        draftEpoch: model.draftEpoch + 1,
        agentCount: String(Math.max(1, restored.agentScopes.length, restored.projection.partitions.length)),
        variation: String(inputs.config.sessions?.[0]?.variationMs ?? inputs.config.session?.variationMs ?? 15),
        editsPerTask: String(inputs.config.sessions?.[0]?.editsPerTask ?? inputs.config.session?.editsPerTask ?? 5),
        taskPause: String(inputs.config.sessions?.[0]?.taskPauseMs ?? inputs.config.session?.taskPauseMs ?? 500),
        adviceResponse: inputs.config.sessions?.[0]?.adviceResponse ?? inputs.config.session?.adviceResponse ?? "ignore",
        repairDelay: String(inputs.config.sessions?.[0]?.repairDelayMs ?? inputs.config.session?.repairDelayMs ?? 300),
        agentId: inputs.config.sessions?.[0]?.agent ?? inputs.config.session?.agent ?? "agent-1",
        ...treeDrafts(latest("fileTrees")?.profile ?? inputs.config.fileTrees ?? DEFAULT_FILE_TREE_PROFILE),
        bookmark: (inputs as Replay & { dashboard?: { bookmark?: number } }).dashboard?.bookmark ?? -1,
        currentWork: (latest("environment")?.currentWork ?? inputs.config.environment?.currentWork ?? true) ? "current" : "stale",
        credentialReady: (latest("environment")?.credentialReady ?? inputs.config.environment?.credentialReady ?? true) ? "ready" : "unavailable",
        credentialGeneration: String(latest("environment")?.credentialGeneration ?? inputs.config.environment?.credentialGeneration ?? 1),
        sourceReadable: (latest("environment")?.sourceReadable ?? inputs.config.environment?.sourceReadable ?? true) ? "readable" : "unreadable",
        outputOutcome: latest("outputProfile")?.outcome ?? inputs.config.outputProfile?.outcome ?? "certain",
        outputDelay: String(latest("outputProfile")?.delayMs ?? inputs.config.outputProfile?.delayMs ?? 0),
        outputLease: String(latest("outputProfile")?.leaseMs ?? inputs.config.outputProfile?.leaseMs ?? 30000),
        seed: String(inputs.config.seed ?? 1),
        editDuration: String(latest("editDuration")?.durationMs ?? inputs.config.sessions?.[0]?.editDurationMs ?? inputs.config.session?.editDurationMs ?? inputs.config.lifecycles?.permits?.holdMs ?? 1),
        pace: String(
          latest("editPace")?.intervalMs ??
            inputs.config.sessions?.[0]?.editIntervalMs ?? inputs.config.session?.editIntervalMs ??
            100,
        ),
        bytes: String(
          latest("sizes")?.reservationBytes ??
            inputs.config.sessions?.[0]?.bytes ?? inputs.config.session?.bytes ??
            100,
        ),
        delay: String(
          latest("jevProfile")?.delayMs ?? inputs.config.jevDelay ?? 5,
        ),
        ...weightDrafts(appliedWeights(inputs)),
      };
      wallBudget = 0;
      feedback =
        "Replay reconstructed from initial inputs and recorded controls. Paused at the recorded endpoint.";
    } else {
      if (!run) throw new Error("Start or load a run first.");
      switch (action) {
        case "step": {
          playing = false;
          const observation = replayEndpoint && run.eventCount >= replayEndpoint.eventCount ? undefined : run.step();
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
            agent: model.agentId,
            intervalMs: number(model.pace, "Edit pace", 1, 1_000_000),
          });
          feedback = "Future edit pace updated at this virtual boundary.";
          break;
        case "editDuration":
          run.applyControl({ kind: "editDuration", agent: model.agentId, durationMs: number(model.editDuration, "Simulated edit duration", 0, 1_000_000_000) });
          feedback = "Future simulated PRE-to-POST duration updated for the selected agent. In-progress edits keep their timing.";
          break;
        case "burst":
          run.applyControl({
            kind: "burst",
            agent: model.agentId,
            count: number(model.burst, "Burst count", 1, 100),
          });
          feedback = "Bounded edit burst recorded.";
          break;
        case "environment":
          run.applyControl({ kind: "environment", ...environmentFacts(model) });
          feedback = "Environment facts applied. Pending requests recheck freshness at settlement; new checks use the current credential fact.";
          break;
        case "output":
          run.applyControl({ kind: "outputProfile", ...outputProfile(model) });
          feedback = "Host output profile applied for future authorizations. Already authorized output keeps its captured delay, lease and outcome.";
          break;
        case "suspend":
          suspended = !suspended;
          run.applyControl({ kind: "suspendArrivals", suspended, agent: model.agentId });
          feedback = suspended
            ? "Future edits suspended. Existing synthetic work continues; playback will wait when settled."
            : "Future edit generation resumed.";
          break;
        case "fileTrees":
          run.applyControl({ kind: "fileTrees", profile: treeProfile(model) });
          feedback = "Tree generation applied to future preparations. In-flight trees keep their captured facts.";
          break;
        case "sizes":
          run.applyControl({
            kind: "sizes",
            agent: model.agentId,
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
      suspended: run?.exportReplay().controls.findLast((entry) => entry.control.kind === "suspendArrivals" && (!entry.control.agent || entry.control.agent === model.agentId))?.control.kind === "suspendArrivals" ? (run.exportReplay().controls.findLast((entry) => entry.control.kind === "suspendArrivals" && (!entry.control.agent || entry.control.agent === model.agentId))!.control as Extract<Control, { kind: "suspendArrivals" }>).suspended : suspended,
      replay,
      selected,
      feedback,
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
  if (fileReadState.error) { const feedback = fileReadState.error; fileReadState.error = undefined; return { ...model, feedback }; }
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
      suspended: (run.exportReplay().controls.findLast((entry) => entry.control.kind === "suspendArrivals" && (!entry.control.agent || entry.control.agent === model.agentId))?.control as Extract<Control, { kind: "suspendArrivals" }> | undefined)?.suspended ?? model.suspended,
      revision: model.revision + 1,
      playing: !completed && (result.reason !== "idle" || model.suspended) && (!replayEndpoint || run.eventCount < replayEndpoint.eventCount),
      feedback: completed ? "Replay reached its exact recorded endpoint." : /^(Cannot apply:|Cannot update:|Could not read replay file:)/.test(model.feedback) ? model.feedback :
        result.reason === "idle"
          ? model.suspended ? "Existing work settled; waiting for edit generation to resume." : "No pending events; playback paused."
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
  showDiagram = true,
  inspection?: { readonly projection: import("../../../src/canonical/adapter").CanonicalProjection; readonly observations: readonly Observation[]; readonly partition?: number; readonly agents?: readonly import("./shared-resident-view").AgentScope[] },
) => {
  // Native dirty inputs own their visible draft. A controlled Value would replay older
  // queued models into the focused field; only explicit draft replacement changes its key.
  const input = (field: string, label: string, value: string) =>
    h.label(
      [],
      [
        label,
        h.input([
          h.Type("text"),
          h.Key(`draft:${field}:${model.draftEpoch}`),
          h.Attribute("value", value),
          h.OnInput((raw) => changed(field, raw)),
        ]),
      ],
    );
  const button = (label: string, name: string) =>
    h.button([h.Type("button"), h.OnClick(action(name))], [label]);
  const submit = (label: string) => h.button([h.Type("submit")], [label]);
  const controlForm = (name: string, children: Parameters<typeof h.form>[1]) => h.form([h.Class("simulation-controls"), h.OnSubmit(action(name))], children);
  const select = (field: string, label: string, value: string, choices: readonly string[]) => h.label([], [label, h.select([h.AriaLabel(label), h.Value(value), h.OnChange((raw) => changed(field, raw))], choices.map((choice) => h.option([h.Value(choice)], [choice])))]);
  const weights = rawWeights(model);
  const weightTotal = JEV_OUTCOME_ORDER.reduce((total, outcome) => total + weights[outcome], 0);
  let draftMix = "Choose at least one nonzero weight.";
  try { draftMix = mixSummary(weights); } catch { /* Invalid drafts are previewed without touching the engine. */ }
  const observations = run?.observe().observations ?? [];
  const activeReplay = run?.exportReplay();
  const latestControl = <Kind extends Control["kind"]>(kind: Kind) => activeReplay?.controls.map((entry) => entry.control).findLast((control): control is Extract<Control, { kind: Kind }> => control.kind === kind && (!control.agent || control.agent === model.agentId));
  const activeTrees = activeReplay ? latestControl("fileTrees")?.profile ?? activeReplay.config.fileTrees ?? DEFAULT_FILE_TREE_PROFILE : undefined;
  let treeDraftStatus: string;
  try {
    const draft = treeProfile(model);
    const unapplied = activeTrees && (Object.keys(treeFields) as (keyof FileTreeProfile)[]).some(key => draft[key] !== activeTrees[key]);
    treeDraftStatus = `Draft: ${treeSummary(draft)} · source ${draft.minSourceBytes}–${draft.maxSourceBytes} B/file · evidence ${draft.minTreeBytes}–${draft.maxTreeBytes} B/file.${unapplied ? " Unapplied changes." : ""}`;
  }
  catch (error) { treeDraftStatus = `Cannot apply: ${error instanceof Error ? error.message : String(error)}`; }
  const treeInput = (field: typeof treeFields[keyof typeof treeFields], label: string, min: number, max: number, shortLabel = label) => h.label([], [shortLabel,
    h.input([h.Type("number"), h.AriaLabel(label), h.Min(String(min)), h.Max(String(max)), h.Step("1"), h.Key(`draft:${field}:${model.draftEpoch}`), h.Attribute("value", model[field]), h.OnInput(raw => changed(field, raw))]),
  ]);
  const current =
    model.selected < 0
      ? observations.at(-1)
      : observations.find((item) => item.sequence === model.selected);
  const candidate = current?.capacityMetadata.encodedOutput;
  const availableGroups = current ? Array.from(new Set([...current.after.delivery.slots.map(s => s.group), ...current.after.delivery.counters.map(c => c.group), ...current.after.collection.claims.map(c => c.group), ...(current.capacityMetadata.deliveryGroups ?? []).map(binding => binding.group)])) : [];
  const availableRounds = (inspection?.projection ?? current?.after)?.rounds ?? [];
  const selectedGroup = availableGroups.includes(Number(model.resourceGroup)) && model.resourceGroup !== "" ? model.resourceGroup : "";
  const selectedRound = availableRounds.some(round => String(round.id) === model.resourceRound) ? model.resourceRound : "";
  // A clipped observation history cannot establish the first ordinal of each kind.
  const numbers = numberRecords(observations[0]?.sequence === 0
    ? observations.filter((item) => item.sequence <= (current?.sequence ?? -1)) : []);
  const last: ReplayStep | undefined = current
    ? {
        event: current.event,
        commands: current.commands,
        before: current.before,
        after: current.after,
        rejection: current.rejection,
        origin: "manual",
        preparation: current.preparation,
      }
    : undefined;
  return h.section(
    [h.Id(showDiagram ? "monkey-business" : "agent-simulation"), h.AriaLabel("Resident simulation controls"), h.Class("chart-panel simulation-panel")],
    [
      h.h2([], ["Resident controls & event history"]),
      h.p(
        [],
        [
          "Run, adjust settings, and select a square to inspect its work.",
        ],
      ),
      h.div(
        [h.Class("simulation-controls")],
        [
          button("Normal findings scenario", "preset:normal"),
          button("Slow Jev scenario", "preset:slow"),
          button("Failure → recovery scenario", "preset:failure"),
          button("Capacity pressure scenario", "preset:capacity"),
          button("Freshness change scenario", "preset:stale"),
          button("Credential recovery scenario", "preset:credential"),
          button("Uncertain output scenario", "preset:uncertain"),
          button("Expired delivery lease scenario", "preset:expired"),
          button("Unreadable final source scenario", "preset:source"),
          button("Credential rotation scenario", "preset:rotation"),
          controlForm("start", [input("seed", "Seed", model.seed), input("variation", "Edit interval variation (virtual ms)", model.variation), input("editsPerTask", "Edits per task", model.editsPerTask), input("taskPause", "Pause between tasks (virtual ms)", model.taskPause), h.label([], ["Advice response", h.select([h.AriaLabel("Advice response"), h.Value(model.adviceResponse), h.OnChange(raw => changed("adviceResponse", raw))], [h.option([h.Value("ignore")], ["Ignore advice"]), h.option([h.Value("noAction")], ["Record no action"]), h.option([h.Value("promptRepair")], ["Prompt repair"]), h.option([h.Value("delayedRepair")], ["Delayed repair"])])]), input("repairDelay", "Repair response delay (virtual ms)", model.repairDelay), submit("Start / reset")]),
          button(model.playing ? "Pause" : "Resume", "play"),
          button("Single step", "step"),
          controlForm("speed", [input("speed", "Playback speed (virtual ms / wall ms)", model.speed), submit("Apply playback speed")]),
          h.span([h.Class("applied-speed")], [`Active speed: ${model.appliedSpeed}×`]),
        ],
      ),
      h.div(
        [h.Class("simulation-controls")],
        [
          ...(run && !run.agentScopes.length ? [h.p([], ["Scripted events · no generator controls"])] : [controlForm("pace", [input("pace", "Edit interval (virtual ms)", model.pace), submit("Apply edit pace")]),
          controlForm("editDuration", [h.label([], ["Simulated edit duration (virtual ms)", h.input([h.Type("number"), h.AriaLabel("Simulated edit duration (virtual ms)"), h.Min("0"), h.Max("1000000000"), h.Step("1"), h.Key(`edit-duration:${model.draftEpoch}`), h.Attribute("value", model.editDuration), h.OnInput(raw => changed("editDuration", raw))])]), submit("Apply edit duration")]),
          h.p([], ["Time between PRE and POST. Start applies it to all agents; Apply changes future edits for the selected agent. Edits already in progress keep their duration."]),
          controlForm("burst", [input("burst", "Burst count (1–100)", model.burst), submit("Inject edit burst")]),
          button(
            model.suspended
              ? "Resume edit generation"
              : "Suspend edit generation",
            "suspend",
          )]),
        ],
      ),
      h.div(
        [h.Class("simulation-controls")],
        [
          input("delay", "Simulated Jev delay (virtual ms)", model.delay),
          ...(run && !run.agentScopes.length ? [] : [controlForm("sizes", [input("bytes", "Reservation bytes per edit", model.bytes), submit("Apply reservation size")])]),
        ],
      ),
      h.details([h.Class("simulation-file-trees")], [
        h.summary([], ["Generated import trees"]),
        h.p([], ["File counts include the allowed root. Import depth starts at 0. Permissions are sampled per imported file; the seed reproduces each artifact's tree."]),
        h.div([h.Class("simulation-controls")], [button("Balanced trees", "trees:balanced"), button("Tree budget pressure", "trees:pressure")]),
        controlForm("fileTrees", [
          h.fieldset([h.Class("simulation-tree-range")], [h.legend([], ["Generated files per artifact"]),
            treeInput("treeMinFiles", "Generated files per artifact · minimum", 1, 64, "Minimum"), treeInput("treeMaxFiles", "Generated files per artifact · maximum", 1, 64, "Maximum")]),
          treeInput("treeMaxImports", "Maximum imports per file", 0, 16), treeInput("treeMaxDepth", "Maximum import depth", 0, 12),
          treeInput("treeDeniedPercent", "Denied import targets (%)", 0, 100),
          h.fieldset([h.Class("simulation-tree-range")], [h.legend([], ["Source bytes per file"]),
            treeInput("treeMinSourceBytes", "Source bytes per file · minimum", 1, 1048576, "Minimum"), treeInput("treeMaxSourceBytes", "Source bytes per file · maximum", 1, 1048576, "Maximum")]),
          h.fieldset([h.Class("simulation-tree-range")], [h.legend([], ["Evidence-tree bytes per file"]),
            treeInput("treeMinTreeBytes", "Evidence-tree bytes per file · minimum", 1, 1048576, "Minimum"), treeInput("treeMaxTreeBytes", "Evidence-tree bytes per file · maximum", 1, 1048576, "Maximum")]),
          submit("Apply to future preparations"),
        ]),
        h.p([h.Class("simulation-tree-draft")], [treeDraftStatus]),
        h.p([h.Class("simulation-tree-active")], [activeTrees ? `Applied to new preparations: ${treeSummary(activeTrees)} · source ${activeTrees.minSourceBytes}–${activeTrees.maxSourceBytes} B/file · evidence ${activeTrees.minTreeBytes}–${activeTrees.maxTreeBytes} B/file.` : "Start / reset applies the draft generation settings."]),
        h.p([], ["Changes apply when a preparation starts. In-flight trees stay fixed. Checked graph budgets remain 8 files read, depth 4 and 20 KiB of accepted evidence. Generation may exceed those budgets. Reservation bytes are a separate review admission fact."]),
      ]),
      h.div([h.Class("simulation-resource-scenario")], [select("resourceScenario", "Optional resource exercise · applies on Start resident", model.resourceScenario, ["none", "notices", "fit", "oversized"]), h.p([], ["Notices use simulated failures and cooldown clocks. Output bytes are supplied synthetic facts; native encoding is not measured."])]),
      h.details([h.Class("simulation-outcome-mix")], [
        h.summary([], ["Simulated Jev outcome mix · " + draftMix]),
        h.p([], ["Changes affect new requests. Relative weights determine the displayed probabilities." ]),
        ...JEV_OUTCOME_ORDER.map((outcome) => h.label([h.Class("simulation-outcome-slider")], [
          outcomeNames[outcome],
          h.input([h.Type("range"), h.Min("0"), h.Max("100"), h.Step("1"), h.AriaLabel(outcomeNames[outcome]), h.Value(String(weights[outcome])), h.OnInput((raw) => changed(weightField(outcome), raw))]),
          h.span([], [`weight ${weights[outcome]} · ${weightTotal > 0 ? (weights[outcome] / weightTotal * 100).toFixed(1) + "%" : "probability unavailable"}`]),
        ])),
        h.p([h.Class("simulation-mix-total")], [`Total relative weight: ${weightTotal}. ${weightTotal > 0 ? "Normalized probability total: 100%." : "Choose at least one nonzero weight; active mix remains unchanged."}`]),
      ]),
      h.div([h.Class("simulation-controls")], [
        controlForm("environment", [select("currentWork", "Work freshness", model.currentWork, ["current", "stale"]),
        select("credentialReady", "Credential availability", model.credentialReady, ["ready", "unavailable"]),
        input("credentialGeneration", "Credential generation", model.credentialGeneration),
        select("sourceReadable", "Source readability", model.sourceReadable, ["readable", "unreadable"]),
        submit("Apply environment facts")]),
        controlForm("output", [select("outputOutcome", "Host output outcome", model.outputOutcome, ["certain", "uncertain", "failed"]),
        input("outputDelay", "Host output delay (virtual ms)", model.outputDelay),
        input("outputLease", "Delivery lease lifetime (virtual ms)", model.outputLease),
        submit("Apply host output profile")]),
      ]),
      h.p(
        [h.Class("simulation-status"), h.Role("status")],
        [
          `${model.playing ? "Running" : "Paused"} · virtual time ${run?.now ?? 0} ms · edits ${model.suspended ? "suspended" : "enabled"} · ${model.feedback}`,
        ],
      ),
      h.p([h.Class("simulation-inspection")], [model.selected < 0 ? "Viewing latest observation" : `Inspecting event ${current?.sequence ?? "unavailable"} at ${current?.time ?? 0} ms; run endpoint ${run?.now ?? 0} ms. Playback paused. Applied controls affect the run endpoint, not this historical event.`]),
      h.div([h.Class("simulation-controls")], [button("Previous event", "previous"), button("Next event", "next"), button("Return to latest", "latest"), button("Replay from start", "replay-start"), button("Inspect oldest retained event", "from-start"), button("Bookmark event", "bookmark"), button("Go to bookmark", "go-bookmark")]),
      h.p([h.Class("simulation-outcomes")], [`Run outcomes: ${totals.checked} checked events · ${totals.admitted} observations admitted · ${totals.refused} refusals · ${totals.failed} failures/timeouts · ${totals.advice} confirmed host submissions · ${totals.uncertain} uncertain advice submissions · ${totals.released} released output attempts. ${run && model.suspended && !run.projection.work.some((work) => work.kind !== "pendingFinding") && run.projection.dispatch.requests.length === 0 && run.projection.collection.leases.length === 0 && !run.projection.delivery.slots.some((slot) => ["reserved", "authorized", "uncertain"].includes(slot.phase)) && !run.projection.delivery.submissions.batches.some((batch) => ["reserved", "authorized", "uncertain"].includes(batch.phase)) ? `Transient work settled; ${run.projection.collection.ready.length} retained advice records; arrivals suspended.` : "Work or future arrivals remain."}`]),
      h.p([h.Class("simulation-active-controls")], [activeReplay ? `Active environment: edit interval ${latestControl("editPace")?.intervalMs ?? activeReplay.config.sessions?.find(session => session.agent === model.agentId)?.editIntervalMs ?? activeReplay.config.session?.editIntervalMs ?? 100} ms · simulated edit duration ${latestControl("editDuration")?.durationMs ?? activeReplay.config.sessions?.find(session => session.agent === model.agentId)?.editDurationMs ?? activeReplay.config.session?.editDurationMs ?? activeReplay.config.lifecycles?.permits?.holdMs ?? 1} ms · Jev delay ${latestControl("jevProfile")?.delayMs ?? activeReplay.config.jevDelay ?? 5} ms · active mix ${mixSummary(appliedWeights(activeReplay))} · reservation ${latestControl("sizes")?.reservationBytes ?? activeReplay.config.sessions?.find(session => session.agent === model.agentId)?.bytes ?? activeReplay.config.session?.bytes ?? 100} bytes.` : "Start a run to apply environment settings."]),
      ...(run && showDiagram
        ? [productionFlowView(h, current?.after ?? run.projection, last, false, (place) => action(`focus:${place}`), preparationSnapshot(observations.filter(frame => frame.sequence <= (current?.sequence ?? -1)).map(frame => ({ ...frame, origin: "manual" as const }))), numbers)]
        : []),
      ...(run && showDiagram ? [reviewCapacityView(h, current?.after ?? run.projection)] : []),
      h.p([h.Class("simulation-active-effects")], [activeReplay ? `Active facts: work ${(latestControl("environment")?.currentWork ?? activeReplay.config.environment?.currentWork ?? true) ? "current" : "stale"} · credential ${(latestControl("environment")?.credentialReady ?? activeReplay.config.environment?.credentialReady ?? true) ? "ready" : "unavailable"} (generation ${latestControl("environment")?.credentialGeneration ?? activeReplay.config.environment?.credentialGeneration ?? 1}) · source ${(latestControl("environment")?.sourceReadable ?? activeReplay.config.environment?.sourceReadable ?? true) ? "readable" : "unreadable"}. Future host output: ${latestControl("outputProfile")?.outcome ?? activeReplay.config.outputProfile?.outcome ?? "certain"} · delay ${latestControl("outputProfile")?.delayMs ?? activeReplay.config.outputProfile?.delayMs ?? 0} ms · lease ${latestControl("outputProfile")?.leaseMs ?? activeReplay.config.outputProfile?.leaseMs ?? 30000} ms. In-flight output keeps its captured profile.` : "No active synthetic environment."]),
      h.details([], [h.summary([], ["Control history"]), h.pre([], [activeReplay ? JSON.stringify({ initial: activeReplay.config, controls: activeReplay.controls.map((entry) => ({ time: entry.time, ...entry.control })) }, null, 2) : "No run started."])]),
      h.div([h.Class(`simulation-stage-inspector${model.focus ? " capacity-selected" : ""}${model.focus === "preparation" ? " preparation-selected" : ""}`)], [
      h.details([h.Open(true)], [h.summary([], ["Inspect a diagram stage by keyboard"]), h.select([h.AriaLabel("Diagram stage"), h.Value(model.stage), h.OnChange((raw) => changed("stage", raw))], PLACE_ORDER.map((place) => h.option([h.Value(place)], [SQUARES[place].title]))), button("Inspect selected stage", "focus-stage")]),
      ...(model.focus ? [button("Clear lifecycle filter", "focus:")] : []),
      ...(model.focus && current ? [h.details([h.Open(true)], [h.summary([], [`Focused lifecycle and state: ${SQUARES[model.focus as keyof typeof SQUARES]?.title}`]), h.p([], [SQUARES[model.focus as keyof typeof SQUARES]?.detail(inspection?.projection ?? current.after, numbers) ?? ""]), ...(["delivery", "round"].includes(model.focus) ? [h.label([], ["Delivery group", h.select([h.AriaLabel("Resource delivery group"), h.Value(selectedGroup), h.OnChange(raw => changed("resourceGroup", raw))], [h.option([h.Value("")], ["Select group"]), ...availableGroups.map(group => h.option([h.Value(String(group))], [`Group ${group}`]))])])] : []), ...(["round"].includes(model.focus) ? [h.label([], ["Current round", h.select([h.AriaLabel("Resource current round"), h.Value(selectedRound), h.OnChange(raw => changed("resourceRound", raw))], [h.option([h.Value("")], ["Select round"]), ...availableRounds.map(round => h.option([h.Value(String(round.id))], [`Partition ${round.partition} · round ${round.id}`]))])])] : []), stageResourceDetails(h, model.focus, inspection?.projection ?? current.after, current.after, current.capacityMetadata, candidate, inspection?.partition ?? run?.agentScopes.find(a => a.agent === model.agentId)?.partition, selectedGroup === "" ? undefined : Number(selectedGroup), selectedRound === "" ? undefined : Number(selectedRound), inspection?.agents ?? run?.agentScopes), ...(model.focus === "preparation" ? [preparationDetails(h, preparationSnapshot((inspection?.observations ?? observations).filter(frame => frame.sequence <= current.sequence).map(frame => ({ ...frame, origin: "manual" as const }))), numbers)] : []), h.ul([], locateFlow(inspection?.projection ?? current.after, numbers).filter((record) => record.stage === model.focus || model.focus === "jev" && record.key.startsWith("request:")).map((record) => h.li([], [button(record.description, `item:${recordIdentity(record.key)}`)]))), h.p([], [model.item ? `Following ${model.item}; history is filtered to this identity.` : "Select a record to follow its lifecycle."])])] : []),
      ]),
      h.details(
        [h.Class("simulation-details")],
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
      h.p([], ["Recent 100 events"]),
      button(model.filter === "all" ? "Show refusals and delivery problems" : "Show all events", "filter"),
      h.div(
        [h.Class("simulation-history")],
        observations
          .filter((item) => !model.item || followsRecord(item, model.item))
          .filter((item) => !model.focus || model.item || (item.event.kind === "preparationGraph" ? model.focus === "preparation" : projectFlowStep({ event: item.event, commands: item.commands, before: item.before, after: item.after, rejection: item.rejection }).changedStages.includes(model.focus as (typeof PLACE_ORDER)[number])))
          .filter((item) => model.filter === "all" || item.rejection || item.commands.some((command) => /Refused$|Denied$|Unavailable$/.test(command.kind)) || item.event.kind === "submissionTerminal" && !item.event.certain || item.event.kind === "finishTerminal" && item.event.outcome === "unknown" || item.event.kind === "submissionRelease" || item.event.kind === "collectionLeaseCheck" && item.event.expired || /fail|timeout/i.test(JSON.stringify(item.event)))
          .slice(-100)
          .map((item) =>
            h.button([h.Type("button"), h.Class(item.sequence === current?.sequence ? "selected" : ""), h.OnClick(action(`inspect:${item.sequence}`))], [
              `${item.sequence}. ${item.time} ms · ${item.agent ?? "resident"} · ${item.event.kind === "preparationGraph" ? `preparation · ${item.event.fact.kind} · operation #${item.event.operation}` : item.event.kind}${item.rejection ? ` · refusal: ${item.rejection}` : ""}`,
            ]),
          ),
      ),
      h.label([], ["Retained event timeline", h.input([h.Type("range"), h.AriaLabel("Retained event timeline"), h.Min(String(observations[0]?.sequence ?? 0)), h.Max(String(observations.at(-1)?.sequence ?? 0)), h.Value(String(current?.sequence ?? 0)), h.OnInput((raw) => action(`inspect:${raw}`))])]),
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

/** The dashboard has one resident Run, shared by every displayed agent partition. */
export const simulationRun = () => run;

/** Load applied generator values when inspecting a different agent. */
export const selectSimulationAgent = (model: SimulationModel, agent: string): SimulationModel => {
  if (run && !run.agentScopes.length) return { ...model, agentId: agent, item: "" };
  const replay = run?.exportReplay();
  const session = replay?.config.sessions?.find(session => session.agent === agent) ?? replay?.config.session;
  const latest = <Kind extends Control["kind"]>(kind: Kind) => replay?.controls.findLast(entry => entry.control.kind === kind && (!entry.control.agent || entry.control.agent === agent))?.control as Extract<Control, { kind: Kind }> | undefined;
  return { ...model, agentId: agent, item: "", draftEpoch: model.draftEpoch + 1,
    editDuration: String(latest("editDuration")?.durationMs ?? session?.editDurationMs ?? replay?.config.lifecycles?.permits?.holdMs ?? 1),
    pace: String(latest("editPace")?.intervalMs ?? session?.editIntervalMs ?? 100),
    bytes: String(latest("sizes")?.reservationBytes ?? session?.bytes ?? 100),
    suspended: latest("suspendArrivals")?.suspended ?? false,
  };
};
