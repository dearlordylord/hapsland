import { type EventId } from "./view-contract";
import { EVENT_LABELS } from "./diagram";
import { projectSequence } from "./generation";

export type Lane = "runtime" | "review" | "delivery" | "result" | "unknown";
export const LANES = {
  runtime: "Agent runtime observations",
  review: "Hapsland review",
  delivery: "Advice writes and finish-hook responses",
  result: "Observed outcome",
  unknown: "Not observed inside the runtime",
} as const satisfies Record<Lane, string>;

type Timed = { readonly label: string; readonly lane: Lane; readonly at: number; readonly until?: number };
export type TimelineEntry =
  | (Timed & { readonly kind: "native observation"; readonly source: string })
  | (Timed & { readonly kind: "unknown"; readonly explanation: string })
  | { readonly kind: "reducer event"; readonly event: EventId; readonly order: number };
export type NativeEntry = Exclude<TimelineEntry, { readonly kind: "reducer event" }>;
export type TimelinePanel = {
  readonly title: string;
  readonly status: "OBSERVED" | "UNPROVEN";
  readonly outcome: string;
  readonly entries: readonly NativeEntry[];
};
export type TimelineCase = {
  readonly title: string;
  readonly requirement: "REQUIRED PRODUCT BEHAVIOR" | "EXPLORATORY TIMING PROBE";
  readonly summary: string;
  readonly panels: readonly TimelinePanel[];
  readonly reducerEvents: readonly EventId[];
  readonly reducerScope: string;
  readonly reducerTitle?: string;
  readonly sources: readonly string[];
};

// Sanitized observations transcribed from retained evidence at this commit.
// Times are milliseconds from each native process launch, never from the reducer.
export const EVIDENCE_BASE = "https://github.com/dearlordylord/hapsland/blob/987674e188b536099e52599d3c4af818d2f3bf4b/evidence/delivery-105/";
const matched = "linux-repeatability-final-1.json";
const background = "linux-background-final.json";
const tools = "linux-native-background-timing-final-tools.json";
const remaining = "linux-native-background-timing-initial-remaining.json";
const recovery = "claude-reset-rerun-linux.md";
const native = (source: string, lane: Lane, label: string, at: number, until?: number): NativeEntry => ({
  kind: "native observation", source, lane, label, at, ...(until === undefined ? {} : { until }),
});
const unknown = (at: number, until: number): NativeEntry => ({
  kind: "unknown", lane: "unknown", label: "Advice receipt time unknown", at, until,
  explanation: "The advice output and later repair are observed separately. No receipt timestamp identifies when the agent received advice; with two writes, the evidence does not identify which one prompted repair. This band marks missing timing evidence, not a measured runtime stage.",
});
const review: readonly EventId[] = ["EditObserved", "ReviewUnitPrepared", "JevFindingReceived"];
const stop: readonly EventId[] = [...review.slice(0, 2), "StopHookFired", "JevFindingReceived", "StopHookFired"];
const duringStopReoffer: readonly EventId[] = [...review, "AdviceLeasedByBackground", "StopHookFired", "HostOutputSubmitted", "StopHookFired"];
const reoffer: readonly EventId[] = [...review, "AdviceLeasedByBackground", "HostOutputSubmitted", "StopHookFired", "StopHookFired"];
const cleanup: readonly EventId[] = ["EditObserved", "ReviewUnitPrepared", "StopHookFired", "FinishDecisionDeadlineReached"];
const backgroundFlow: readonly EventId[] = [...review, "AdviceLeasedByBackground", "HostOutputSubmitted"];

export const TIMELINE_CASES: readonly TimelineCase[] = [
  {
    title: "Before / after: advice via Stop leads to repair",
    requirement: "REQUIRED PRODUCT BEHAVIOR",
    summary: "Matched controlled runs on both runtimes. Before: review completed but no finding was handed off and the file stayed unchanged. After: Hapsland returned advice through the Stop hook and blocked finish; a repair edit followed, the repaired file was checked, and review cleared. Three consecutive renewed runs passed; this chart shows the first.",
    panels: [
      { title: "Codex · before", status: "OBSERVED", outcome: "No finding handoff; no repair. Original file confirmed after exit.", entries: [
        native(matched, "runtime", "Edit hook returned", 6106), native(matched, "review", "Review completed", 7344), native(matched, "runtime", "Runtime exited", 8875),
      ] },
      { title: "Codex · after", status: "OBSERVED", outcome: "Advice sent through Stop; repair and clear follow-up confirmed.", entries: [
        native(matched, "runtime", "UserPromptSubmit hook returned", 2276), native(matched, "runtime", "PreToolUse hook returned", 10582), native(matched, "runtime", "Edit hook returned", 10906), native(matched, "review", "Finding review completed", 14446), native(matched, "delivery", "Advice via Stop hook; block finish", 14504),
        unknown(14504, 18912), native(matched, "runtime", "Repair PreToolUse hook returned", 18912), native(matched, "result", "Repair edit hook returned", 19238), native(matched, "review", "Clear follow-up completed", 22765), native(matched, "delivery", "Allow finish; virtual round closes", 22792), native(matched, "runtime", "Runtime exited", 23325),
      ] },
      { title: "Claude · before", status: "OBSERVED", outcome: "No finding handoff; no repair. Original file confirmed after exit.", entries: [
        native(matched, "runtime", "Edit hook returned", 10084), native(matched, "review", "Review completed", 12376), native(matched, "runtime", "Runtime exited", 13381),
      ] },
      { title: "Claude · after", status: "OBSERVED", outcome: "Advice sent through Stop; repair and clear follow-up confirmed.", entries: [
        native(matched, "runtime", "UserPromptSubmit hook returned", 1089), native(matched, "runtime", "PreToolUse hook returned", 6487), native(matched, "runtime", "Edit hook returned", 6832), native(matched, "review", "Finding review completed", 11874), native(matched, "delivery", "Advice via Stop hook; block finish", 11963),
        unknown(11963, 16157), native(matched, "runtime", "Repair PreToolUse hook returned", 16157), native(matched, "result", "Repair edit hook returned", 16478), native(matched, "review", "Clear follow-up completed", 21501), native(matched, "delivery", "Allow finish; virtual round closes", 21520), native(matched, "runtime", "Runtime exited", 21615),
      ] },
    ], reducerEvents: stop, reducerTitle: "Finish-decision wait → continue-with-advice command → later allow",
    reducerScope: "The companion path checks review → finish response command → close. The reducer chooses a response but does not establish a completed hook write. Baseline behavior, native times, repair observation and file verification are outside the reducer. The abstract path omits the repair review shown above.",
    sources: [matched, "linux-repeatability-final-2.json", "linux-repeatability-final-3.json"],
  },
  {
    title: "Background advice at an available opportunity",
    requirement: "REQUIRED PRODUCT BEHAVIOR",
    summary: "Selected native runs submitted background advice and repaired without a Stop block. These runs establish available opportunities, not delivery during every internal runtime stage.",
    panels: [
      { title: "Codex · background", status: "OBSERVED", outcome: "Repair, independent file check and clear follow-up; no Stop block.", entries: [
        native(background, "runtime", "Edit hook returned", 12525), native(background, "review", "Finding review completed", 13773), native(background, "delivery", "Advice output via background hook", 13858), unknown(13858, 19824),
        native(background, "result", "Repair edit hook returned", 19824), native(background, "review", "Clear follow-up completed", 21057), native(background, "delivery", "Allow finish; virtual round closes", 22502), native(background, "runtime", "Runtime exited", 23118),
      ] },
      { title: "Claude · background", status: "OBSERVED", outcome: "Repair, independent file check and clear follow-up; no Stop block.", entries: [
        native(background, "runtime", "Edit hook returned", 10028), native(background, "review", "Finding review completed", 11267), native(background, "delivery", "Advice output via background hook", 11311), unknown(11311, 22986),
        native(background, "result", "Repair edit hook returned", 22986), native(background, "review", "Clear follow-up completed", 24212), native(background, "delivery", "Allow finish; virtual round closes", 25936), native(background, "runtime", "Runtime exited", 26027),
      ] },
    ], reducerEvents: backgroundFlow, reducerScope: "Checks review → background reservation → observed write. This companion omits the later repair and clear review; those remain native observations here.", sources: [background],
  },
  {
    title: "Background hook write during finish-decision wait; advice reoffered",
    requirement: "REQUIRED PRODUCT BEHAVIOR",
    summary: "The agent tried to finish while review was pending. Hapsland’s Stop hook waited. Background collection obtained the finding first and submitted it through the background hook during that wait. The same Stop hook then sent the advice again and blocked finish. Repair followed; a later Stop allowed finish and closed Hapsland’s virtual round.",
    panels: [{ title: "Claude · overlapping collectors", status: "OBSERVED", outcome: "Repair and clear follow-up observed. Lease ownership was exclusive; reoffer was sequential.", entries: [
      native(remaining, "runtime", "Edit hook returned", 7516), native(remaining, "delivery", "Hapsland Stop hook process", 9960, 10680), native(remaining, "review", "Finding review completed", 10559),
      native(remaining, "delivery", "Advice output via background hook", 10607), native(remaining, "delivery", "Advice again via Stop; block finish", 10677), unknown(10607, 14480),
      native(remaining, "result", "Repair edit hook returned", 14480), native(remaining, "review", "Clear follow-up completed", 17504), native(remaining, "delivery", "Allow finish; virtual round closes", 17544), native(remaining, "runtime", "Runtime exited", 17585),
    ] }], reducerEvents: duringStopReoffer, reducerTitle: "Background lease → finish-decision wait → background write → reoffer", reducerScope: "This companion checks overlapping background output and an open finish decision after advice was reserved for background. The native run has a different order: its finish attempt began before Jev's finding. The current reducer chooses immediately if the last review item finishes without a reserved background write, so this companion does not reproduce that exact race. Native timestamps show write order and repair, not proof that unfinished resources were cancelled; cancellation has separate deterministic evidence.", sources: [remaining, "native-background-timing-linux.md", "round-contract-linux.md"],
  },
  {
    title: "Codex: advice arrives while Bash runs",
    requirement: "EXPLORATORY TIMING PROBE",
    summary: "This specific tool interval was achieved. It is evidence for one observed schedule, not a promise about every tool or model request.",
    panels: [{ title: "Codex · foreground Bash", status: "OBSERVED", outcome: "Repair without Stop block. Follow-up review did not clear before cleanup, so this is not a complete repair-and-clear acceptance run.", entries: [
      native(tools, "runtime", "Edit hook returned", 7133), native(tools, "runtime", "Bash PreToolUse → PostToolUse", 9081, 34143), native(tools, "review", "Finding review completed", 17169),
      native(tools, "delivery", "Advice output via background hook", 17223), unknown(17223, 37621), native(tools, "result", "Repair edit hook returned", 37621), native(tools, "delivery", "Allow finish; virtual round closes", 42715), native(tools, "runtime", "Runtime exited", 43376),
    ] }], reducerEvents: backgroundFlow, reducerScope: "Checks the abstract background delivery path only. Bash boundaries, delayed clear review and observed repair are outside the reducer.", sources: [tools, "native-background-timing-linux.md"],
  },
  {
    title: "Claude: background hook output during a streamed message",
    requirement: "EXPLORATORY TIMING PROBE",
    summary: "Hapsland submitted advice through the background hook during the observed final-message stream. Stop later reoffered; repair followed. No native event identifies when either output was consumed.",
    panels: [{ title: "Claude · final-message stream", status: "OBSERVED", outcome: "Stop reoffer and repair observed; background consumption unknown. Codex in-progress final-message/model-request timing remains unestablished.", entries: [
      native(remaining, "runtime", "Edit hook returned", 7120), native(remaining, "review", "Finding review completed", 8352), native(remaining, "runtime", "Native streamed-message interval", 8404, 30478),
      native(remaining, "delivery", "Advice output via background hook", 8454), native(remaining, "delivery", "Advice again via Stop; block finish", 30810), unknown(8454, 34992), native(remaining, "result", "Repair edit hook returned", 34992),
      native(remaining, "review", "Clear follow-up completed", 36231), native(remaining, "delivery", "Allow finish; virtual round closes", 37226), native(remaining, "runtime", "Runtime exited", 37262),
    ] }], reducerEvents: reoffer, reducerScope: "Checks a background hook write → finish response command reoffering that advice → close. Stream boundaries, completion of that finish response write, and advice consumption are not modeled. Codex exposes completed assistant items in these records, not an equivalent measured in-progress interval.", sources: [remaining, "native-background-timing-linux.md"],
  },
  {
    title: "Claude: actionable foreground-tool window unproven",
    requirement: "EXPLORATORY TIMING PROBE",
    summary: "All three recovery attempts remain visible. Repairs occurred, but none passed the requested actionable-review-inside-foreground-tool scenario. No fourth attempt was run.",
    panels: [
      { title: "Attempt 1 · no Bash call", status: "UNPROVEN", outcome: "Repair observed; exit 0; follow-up did not clear before cleanup. ToolSearch occurred, but no Bash call.", entries: [native(recovery, "review", "Finding review completed", 19237), native(recovery, "delivery", "Advice output via background hook", 19325), native(recovery, "runtime", "Runtime exited", 34676)] },
      { title: "Attempt 2 · timeout", status: "UNPROVEN", outcome: "Actionable finding preceded Bash. The later in-tool result was clear, not actionable. Repair and clear do not turn this timed-out run into a pass.", entries: [
        native(recovery, "review", "Actionable finding completed", 17354), native(recovery, "runtime", "Bash requested background execution", 29657, 30120), native(recovery, "runtime", "Later foreground Bash interval", 54205, 94536),
        native(recovery, "review", "Repair review completed clear", 59020), native(recovery, "runtime", "Timeout signal initiated", 100000), native(recovery, "runtime", "Process / pipes returned", 106201),
      ] },
      { title: "Attempt 3 · no Bash call", status: "UNPROVEN", outcome: "Stop reoffer and repair observed; exit 0. No Bash call; follow-up did not clear before cleanup.", entries: [native(recovery, "review", "Finding review completed", 18168), native(recovery, "delivery", "Advice output via background hook", 18267), native(recovery, "delivery", "Advice again via Stop; block finish", 20950), native(recovery, "runtime", "Runtime exited", 33186)] },
    ], reducerEvents: [], reducerScope: "Native probe evidence only. The reducer has no tool scheduler, model timing or timeout-process lifecycle and cannot validate whether this target interval occurred.", sources: [recovery, "linux-claude-tool-reset-attempt-1.json", "linux-claude-tool-reset-attempt-2.json", "linux-claude-tool-reset-attempt-3.json"],
  },
  {
    title: "Finish-decision wait expires → allow and clean up",
    requirement: "REQUIRED PRODUCT BEHAVIOR",
    summary: "The review has not produced actionable advice by Hapsland’s Stop deadline. Hapsland allows finish and closes its round. The native trace shows the allow response; the separate resident contract establishes cancellation/discard of round-owned work and fences late results. Another plugin may continue the runtime, but this virtual round stays closed.",
    panels: [
      { title: "Codex · delayed review", status: "OBSERVED", outcome: "Stop allowed completion. Round-owned cleanup is established by the separate deterministic contract, not by this native timestamp alone.", entries: [native(remaining, "runtime", "Edit hook returned", 4855), native(remaining, "delivery", "Allow finish; virtual round closes", 10295)] },
      { title: "Claude · delayed review", status: "OBSERVED", outcome: "Stop allowed completion. The native trace does not observe every cancelled or discarded resource.", entries: [native(remaining, "runtime", "Edit hook returned", 6316), native(remaining, "delivery", "Allow finish; virtual round closes", 12901)] },
    ], reducerEvents: cleanup, reducerTitle: "Finish-decision deadline → allow-finish command → discard owned work", reducerScope: "Deadline expiry is an input event; this reducer has no clock. The allow-finish decision removes modeled work while review is running and emits cancellation IDs and a hook response command. The resident contract separately checks cancellation/discard and fencing. The native allow timestamps do not by themselves prove those internal effects.", sources: [remaining, "native-background-timing-linux.md", "round-contract-linux.md"],
  },
  {
    title: "After exit: bounded observation of no late output",
    requirement: "EXPLORATORY TIMING PROBE",
    summary: "After the required Stop allow and round cleanup, these native probes watched for two seconds beyond runtime exit. Neither run completed review, submitted advice, repaired or restarted during that window. This finite observation is not a universal cancellation proof.",
    panels: [
      { title: "Codex · delayed review", status: "OBSERVED", outcome: "No late output observed for two seconds after exit. Cancellation and late-callback rules also have separate deterministic evidence.", entries: [native(remaining, "runtime", "Edit hook returned", 4855), native(remaining, "delivery", "Allow finish; virtual round closes", 10295), native(remaining, "runtime", "Runtime exited", 10865)] },
      { title: "Claude · delayed review", status: "OBSERVED", outcome: "No late output observed for two seconds after exit. No claim about all possible later external responses.", entries: [native(remaining, "runtime", "Edit hook returned", 6316), native(remaining, "delivery", "Allow finish; virtual round closes", 12901), native(remaining, "runtime", "Runtime exited", 13326)] },
    ], reducerEvents: [], reducerTitle: "Native observation only", reducerScope: "The two-second window is a native observation, not a reducer-checked duration. The preceding required cleanup has its own case and separate deterministic resident contract. No finite observation proves absence of every possible late external response.", sources: [remaining, "native-background-timing-linux.md"],
  },
];

// Event identities are checked by TypeScript; legal order is checked by reducer replay.
// This validates the displayed abstract companion path, never native timestamps.
export const reducerSegment = (scenario: TimelineCase) => {
  return projectSequence(scenario.reducerEvents, `Timeline ${scenario.title}`).map((step, order) => {
    const route = step.changes.find((change) => change.kind === "transition")?.route;
    if (route === undefined) throw new Error(`Timeline ${scenario.title}: no emitted route for ${step.event}`);
    return { kind: "reducer event" as const, event: step.event, order, label: EVENT_LABELS[step.event],
      virtualRoundActive: step.state.virtualRoundActive,
      packets: step.state.packets.length,
      changes: step.changes };
  });
};
export const REDUCER_SEGMENTS = TIMELINE_CASES.map(reducerSegment);
