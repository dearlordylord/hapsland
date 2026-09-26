import { initialFlow, stepFlow, TRANSITIONS, type EventId } from "./flow";

export type Lane = "runtime" | "review" | "delivery" | "result" | "unknown";
export const LANES = {
  runtime: "Agent runtime observations",
  review: "Hapsland review",
  delivery: "Advice writes and Stop",
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
  kind: "unknown", lane: "unknown", label: "Advice handling not observed", at, until,
  explanation: "No timestamp establishes when advice became available to the agent or whether this write caused the repair. This band marks missing evidence, not a measured internal stage.",
});
const review: readonly EventId[] = ["EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched", "JevRequestSent", "JevResponseReceived", "FindingRetained"];
const stop: readonly EventId[] = [...review, "StopHookFired", "AdviceLeasedByStop", "HostOutputSubmitted", "StopHookFired", "StopAllowed"];
const reoffer: readonly EventId[] = [...review, "BackgroundHookFired", "AdviceLeasedByBackground", "HostOutputSubmitted", "StopHookFired", "AdviceReofferedAtStop", "HostOutputSubmitted", "StopHookFired", "StopAllowed"];
const cleanup: readonly EventId[] = ["EditObserved", "IngressStarted", "ReviewUnitPrepared", "UnitDispatched", "JevRequestSent", "StopHookFired", "StopAllowed"];
const backgroundFlow: readonly EventId[] = [...review, "BackgroundHookFired", "AdviceLeasedByBackground", "HostOutputSubmitted"];

export const TIMELINE_CASES: readonly TimelineCase[] = [
  {
    title: "Before / after: Stop advice leads to repair",
    requirement: "REQUIRED PRODUCT BEHAVIOR",
    summary: "Matched controlled runs on both runtimes. Before: review completed but no finding was handed off and the file stayed unchanged. After: Stop advice was written, a repair edit followed, the repaired file was checked, and review cleared. Three consecutive renewed runs passed; this chart shows the first.",
    panels: [
      { title: "Codex · before", status: "OBSERVED", outcome: "No finding handoff; no repair. Original file confirmed after exit.", entries: [
        native(matched, "runtime", "Edit hook returned", 6106), native(matched, "review", "Review completed", 7344), native(matched, "runtime", "Runtime exited", 8875),
      ] },
      { title: "Codex · after", status: "OBSERVED", outcome: "Stop advice submitted; repair and clear follow-up confirmed.", entries: [
        native(matched, "runtime", "UserPromptSubmit hook returned", 2276), native(matched, "runtime", "PreToolUse hook returned", 10582), native(matched, "runtime", "Edit hook returned", 10906), native(matched, "review", "Finding review completed", 14446), native(matched, "delivery", "Stop returned advice + continue", 14504),
        unknown(14504, 19238), native(matched, "runtime", "Repair PreToolUse hook returned", 18912), native(matched, "result", "Repair edit hook returned", 19238), native(matched, "review", "Clear follow-up completed", 22765), native(matched, "delivery", "Stop returned allow", 22792), native(matched, "runtime", "Runtime exited", 23325),
      ] },
      { title: "Claude · before", status: "OBSERVED", outcome: "No finding handoff; no repair. Original file confirmed after exit.", entries: [
        native(matched, "runtime", "Edit hook returned", 10084), native(matched, "review", "Review completed", 12376), native(matched, "runtime", "Runtime exited", 13381),
      ] },
      { title: "Claude · after", status: "OBSERVED", outcome: "Stop advice submitted; repair and clear follow-up confirmed.", entries: [
        native(matched, "runtime", "UserPromptSubmit hook returned", 1089), native(matched, "runtime", "PreToolUse hook returned", 6487), native(matched, "runtime", "Edit hook returned", 6832), native(matched, "review", "Finding review completed", 11874), native(matched, "delivery", "Stop returned advice + continue", 11963),
        unknown(11963, 16478), native(matched, "runtime", "Repair PreToolUse hook returned", 16157), native(matched, "result", "Repair edit hook returned", 16478), native(matched, "review", "Clear follow-up completed", 21501), native(matched, "delivery", "Stop returned allow", 21520), native(matched, "runtime", "Runtime exited", 21615),
      ] },
    ], reducerEvents: stop,
    reducerScope: "The companion path checks review → Stop submission → close. Baseline behavior, native times, repair observation and file verification are outside the reducer. The abstract path omits the repair review shown above.",
    sources: [matched, "linux-repeatability-final-2.json", "linux-repeatability-final-3.json"],
  },
  {
    title: "Background advice at an available opportunity",
    requirement: "REQUIRED PRODUCT BEHAVIOR",
    summary: "Selected native runs submitted background advice and repaired without a Stop block. These runs establish available opportunities, not delivery during every internal runtime stage.",
    panels: [
      { title: "Codex · background", status: "OBSERVED", outcome: "Repair, independent file check and clear follow-up; no Stop block.", entries: [
        native(background, "runtime", "Edit hook returned", 12525), native(background, "review", "Finding review completed", 13773), native(background, "delivery", "Background write completed", 13858), unknown(13858, 19824),
        native(background, "result", "Repair edit hook returned", 19824), native(background, "review", "Clear follow-up completed", 21057), native(background, "delivery", "Stop returned allow", 22502), native(background, "runtime", "Runtime exited", 23118),
      ] },
      { title: "Claude · background", status: "OBSERVED", outcome: "Repair, independent file check and clear follow-up; no Stop block.", entries: [
        native(background, "runtime", "Edit hook returned", 10028), native(background, "review", "Finding review completed", 11267), native(background, "delivery", "Background write completed", 11311), unknown(11311, 22986),
        native(background, "result", "Repair edit hook returned", 22986), native(background, "review", "Clear follow-up completed", 24212), native(background, "delivery", "Stop returned allow", 25936), native(background, "runtime", "Runtime exited", 26027),
      ] },
    ], reducerEvents: backgroundFlow, reducerScope: "Checks review → background reservation → write. The current one-item reducer cannot replay a repair while background advice remains retained; later native repair and clear review are observations only.", sources: [background],
  },
  {
    title: "Stop fallback: reoffer, then cleanup",
    requirement: "REQUIRED PRODUCT BEHAVIOR",
    summary: "Background and Stop collection overlapped. Background wrote first; Stop then used a separate reoffer lease. The round continued for repair, then closed. A write does not prove the earlier advice was seen or unseen.",
    panels: [{ title: "Claude · overlapping collectors", status: "OBSERVED", outcome: "Repair and clear follow-up observed. Lease ownership was exclusive; reoffer was sequential.", entries: [
      native(remaining, "runtime", "Edit hook returned", 7516), native(remaining, "delivery", "Stop command running", 9960, 10680), native(remaining, "review", "Finding review completed", 10559),
      native(remaining, "delivery", "Background write completed", 10607), native(remaining, "delivery", "Stop reoffer returned", 10677), unknown(10607, 14480),
      native(remaining, "result", "Repair edit hook returned", 14480), native(remaining, "review", "Clear follow-up completed", 17504), native(remaining, "delivery", "Stop returned allow", 17544), native(remaining, "runtime", "Runtime exited", 17585),
    ] }], reducerEvents: reoffer, reducerScope: "Checks retained background advice → one Stop reoffer → close and removal of live packets. Native IPC leases, cancellation scheduling and real elapsed time remain outside this reducer.", sources: [remaining, "native-background-timing-linux.md", "round-contract-linux.md"],
  },
  {
    title: "Codex: advice arrives while Bash runs",
    requirement: "EXPLORATORY TIMING PROBE",
    summary: "This specific tool interval was achieved. It is evidence for one observed schedule, not a promise about every tool or model request.",
    panels: [{ title: "Codex · foreground Bash", status: "OBSERVED", outcome: "Repair without Stop block. Follow-up review did not clear before cleanup, so this is not a complete repair-and-clear acceptance run.", entries: [
      native(tools, "runtime", "Edit hook returned", 7133), native(tools, "runtime", "Bash PreToolUse → PostToolUse", 9081, 34143), native(tools, "review", "Finding review completed", 17169),
      native(tools, "delivery", "Background write completed", 17223), unknown(17223, 37621), native(tools, "result", "Repair edit hook returned", 37621), native(tools, "delivery", "Stop returned allow", 42715), native(tools, "runtime", "Runtime exited", 43376),
    ] }], reducerEvents: backgroundFlow, reducerScope: "Checks the abstract background delivery path only. Bash boundaries, delayed clear review and observed repair are outside the reducer.", sources: [tools, "native-background-timing-linux.md"],
  },
  {
    title: "Claude: write during a streamed message",
    requirement: "EXPLORATORY TIMING PROBE",
    summary: "A background write occurred during the observed final-message stream. Stop later reoffered; repair followed. No native event identifies when either write was consumed.",
    panels: [{ title: "Claude · final-message stream", status: "OBSERVED", outcome: "Stop reoffer and repair observed; background consumption unknown. Codex in-progress final-message/model-request timing remains unestablished.", entries: [
      native(remaining, "runtime", "Edit hook returned", 7120), native(remaining, "review", "Finding review completed", 8352), native(remaining, "runtime", "Native streamed-message interval", 8404, 30478),
      native(remaining, "delivery", "Background write completed", 8454), native(remaining, "delivery", "Stop reoffer returned", 30810), unknown(8454, 34992), native(remaining, "result", "Repair edit hook returned", 34992),
      native(remaining, "review", "Clear follow-up completed", 36231), native(remaining, "delivery", "Stop returned allow", 37226), native(remaining, "runtime", "Runtime exited", 37262),
    ] }], reducerEvents: reoffer, reducerScope: "Checks background write → Stop reoffer → close. Stream boundaries and advice consumption are not modeled. Codex exposes completed assistant items in these records, not an equivalent measured in-progress interval.", sources: [remaining, "native-background-timing-linux.md"],
  },
  {
    title: "Claude: actionable foreground-tool window unproven",
    requirement: "EXPLORATORY TIMING PROBE",
    summary: "All three recovery attempts remain visible. Repairs occurred, but none passed the requested actionable-review-inside-foreground-tool scenario. No fourth attempt was run.",
    panels: [
      { title: "Attempt 1 · no Bash call", status: "UNPROVEN", outcome: "Repair observed; exit 0; follow-up did not clear before cleanup. ToolSearch occurred, but no Bash call.", entries: [native(recovery, "review", "Finding review completed", 19237), native(recovery, "delivery", "Background write completed", 19325), native(recovery, "runtime", "Runtime exited", 34676)] },
      { title: "Attempt 2 · timeout", status: "UNPROVEN", outcome: "Actionable finding preceded Bash. The later in-tool result was clear, not actionable. Repair and clear do not turn this timed-out run into a pass.", entries: [
        native(recovery, "review", "Actionable finding completed", 17354), native(recovery, "runtime", "Bash requested background execution", 29657, 30120), native(recovery, "runtime", "Later foreground Bash interval", 54205, 94536),
        native(recovery, "review", "Repair review completed clear", 59020), native(recovery, "runtime", "Timeout signal initiated", 100000), native(recovery, "runtime", "Process / pipes returned", 106201),
      ] },
      { title: "Attempt 3 · no Bash call", status: "UNPROVEN", outcome: "Stop reoffer and repair observed; exit 0. No Bash call; follow-up did not clear before cleanup.", entries: [native(recovery, "review", "Finding review completed", 18168), native(recovery, "delivery", "Background write completed", 18267), native(recovery, "delivery", "Stop reoffer returned", 20950), native(recovery, "runtime", "Runtime exited", 33186)] },
    ], reducerEvents: [], reducerScope: "Native probe evidence only. The reducer has no tool scheduler, model timing or timeout-process lifecycle and cannot validate whether this target interval occurred.", sources: [recovery, "linux-claude-tool-reset-attempt-1.json", "linux-claude-tool-reset-attempt-2.json", "linux-claude-tool-reset-attempt-3.json"],
  },
  {
    title: "After exit: bounded observation of no late output",
    requirement: "EXPLORATORY TIMING PROBE",
    summary: "A 30-second review delay outlasted the Stop wait. Neither run completed review, submitted advice, repaired or restarted during the retained observation. Two seconds after exit is a finite observation, not a universal cancellation proof. Cleanup itself remains required product behavior.",
    panels: [
      { title: "Codex · delayed review", status: "OBSERVED", outcome: "No late output observed for two seconds after exit. Cancellation and late-callback rules also have separate deterministic evidence.", entries: [native(remaining, "runtime", "Edit hook returned", 4855), native(remaining, "delivery", "Stop returned allow", 10295), native(remaining, "runtime", "Runtime exited", 10865)] },
      { title: "Claude · delayed review", status: "OBSERVED", outcome: "No late output observed for two seconds after exit. No claim about all possible later external responses.", entries: [native(remaining, "runtime", "Edit hook returned", 6316), native(remaining, "delivery", "Stop returned allow", 12901), native(remaining, "runtime", "Runtime exited", 13326)] },
    ], reducerEvents: cleanup, reducerScope: "Checks that Stop allow removes modeled work while review is running. It does not prove external cancellation, late-callback fencing after a new round, or native behavior beyond the observation window.", sources: [remaining, "native-background-timing-linux.md", "round-contract-linux.md"],
  },
];

// Event identities are checked by TypeScript; legal order is checked by reducer replay.
// This validates the displayed abstract companion path, never native timestamps.
export const reducerSegment = (scenario: TimelineCase) => {
  let state = initialFlow();
  return scenario.reducerEvents.map((event, order) => {
    const result = stepFlow(state, event);
    if (!result.accepted) throw new Error(`Timeline ${scenario.title}: ${event}: ${result.state.note}`);
    state = result.state;
    return { kind: "reducer event" as const, event, order, label: TRANSITIONS[event].label, roundActive: state.roundActive, packets: state.packets.length };
  });
};
export const REDUCER_SEGMENTS = TIMELINE_CASES.map(reducerSegment);
