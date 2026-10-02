import type { HtmlBuilder } from "foldkit/html";

/** Code-based installed-flow illustrations and separate advisory proposals; no timing telemetry. */
export const postEditTimingView = <Message>(h: HtmlBuilder<Message>) => {
  const lanes = ["Agent edit", "Post hook", "Resident", "Jev", "Stop"];
  const trace = (kind: "receipt" | "grace" | "race", title: string, explanation: string) => {
    const band = (lane: number, x: number, width: number, label: string, color: string, dashed = false) => h.g([], [
      h.rect([h.X(String(x)),h.Y(String(43+lane*47)),h.Width(String(width)),h.Height("30"),h.Rx("5"),h.Fill(dashed ? "#fff" : color),h.Stroke(color),h.StrokeWidth("2"),...(dashed ? [h.StrokeDasharray("5 4")] : [])],[]),
      h.text([h.X(String(x+width/2)),h.Y(String(63+lane*47)),h.TextAnchor("middle"),h.FontSize("12"),h.FontWeight("600"),h.Fill(dashed ? color : "#fff")],[label]),
    ]);
    const arrow = (x: number, from: number, to: number) => {
      const start=74+from*47;const end=41+to*47;
      return h.g([], [h.path([h.D(`M ${x} ${start} L ${x} ${end}`),h.Fill("none"),h.Stroke("#8094aa"),h.StrokeDasharray("3 3")],[]),h.path([h.D(`M ${x-4} ${end-6} L ${x} ${end} L ${x+4} ${end-6}`),h.Fill("none"),h.Stroke("#8094aa")],[])]);
    };
    const bands = kind === "receipt" ? [
      band(0,180,105,"Edit ends","#536b86"),band(0,470,180,"Continues → calls Stop","#536b86"),
      band(1,300,165,"Report edit / reply","#326dac"),
      band(2,330,105,"Record edit","#267b70"),band(2,470,150,"Background prep","#536b86"),
      band(3,620,185,"Review in background","#8b6618"),
      band(4,650,155,"Wait for known work","#76549a"),band(4,815,130,"Settled: return","#76549a"),
      arrow(375,1,2),arrow(620,2,3),
    ] : kind === "grace" ? [
      band(0,180,105,"Edit ends","#536b86"),band(0,300,170,"Continues → calls Stop","#536b86"),
      band(1,490,175,"Async post arrives","#326dac"),
      band(2,535,110,"Record edit","#267b70"),band(2,650,145,"Background prep","#536b86"),
      band(3,795,145,"Background review","#8b6618"),
      band(4,470,180,"Wait for edit report","#76549a",true),band(4,650,160,"Remaining wait time","#76549a"),band(4,820,125,"Time limit: return","#76549a"),
      arrow(585,1,2),arrow(795,2,3),
    ] : [
      band(0,180,105,"Edit ends","#536b86"),band(0,300,170,"Continues → calls Stop","#536b86"),
      band(1,650,175,"Delayed async post","#326dac"),
      band(2,700,125,"Record too late","#267b70"),
      band(3,835,125,"Review after Stop","#8b6618"),
      band(4,470,160,"No work: return","#a45b32"),arrow(760,1,2),arrow(835,2,3),
    ];
    return h.article([h.Class(`post-edit-trace ${kind}`)], [
      h.h3([], [title]),h.p([], [explanation]),
      h.div([h.Class("post-edit-trace-scroll"),h.Tabindex(0),h.Role("region"),h.AriaLabel(`${title} timeline; scroll horizontally on narrow screens`)], [
        h.svg([h.ViewBox("0 0 1000 295"),h.Role("img"),h.AriaLabel(`${title}. ${explanation}`)], [
          h.title([], [title]),
          h.text([h.X("180"),h.Y("18"),h.FontSize("12"),h.Fill("#536b86")],["Event order →"]),
          ...lanes.flatMap((lane,index)=>[h.text([h.X("12"),h.Y(String(63+index*47)),h.FontSize("14"),h.FontWeight("600"),h.Fill("#263c53")],[lane]),h.path([h.D(`M 170 ${78+index*47} H 960`),h.Stroke("#dce5ef"),h.Fill("none")],[])]),
          ...bands,
        ]),
      ]),
    ]);
  };
  const currentTrace = (host: "Claude Code" | "Codex CLI") => {
    const claude = host === "Claude Code";
    const currentLanes = ["Pre hook", "Agent edit", "Post hook", "Resident / Jev", "Background collector", "Stop"];
    const block = (lane: number, x: number, width: number, label: string, color: string, optional = false) => h.g([], [
      h.rect([h.X(String(x)),h.Y(String(38+lane*48)),h.Width(String(width)),h.Height("30"),h.Rx("5"),h.Fill(optional ? "#fff" : color),h.Stroke(color),h.StrokeWidth("2"),...(optional ? [h.StrokeDasharray("5 4")] : [])],[]),
      h.text([h.X(String(x+width/2)),h.Y(String(58+lane*48)),h.TextAnchor("middle"),h.FontSize("12"),h.FontWeight("600"),h.Fill(optional ? color : "#fff")],[label]),
    ]);
    return h.article([h.Class("current-hook-trace")],[
      h.h3([], [host]),
      h.p([], [claude ? "Before the edit, the pre hook records its identity with the resident. After the edit, the synchronous post hook reports it and can wait for review until a result or its time limit. The agent continues only when that post hook returns. In this example its time limit arrives before review finishes." : "Before the edit, the pre hook records its identity with the resident. After the edit, the synchronous post hook reports it and returns. Resident preparation and Jev review continue in the background while the agent continues."]),
      h.div([h.Class("post-edit-trace-scroll"),h.Tabindex(0),h.Role("region"),h.AriaLabel(`${host} current installed timeline; scroll horizontally on narrow screens`)], [
        h.svg([h.ViewBox("0 0 1060 345"),h.Role("img"),h.AriaLabel(`${host} current installed successful edit and unfinished-review Stop example`)], [
          h.title([], [`Current installed ${host} hook timing`]),
          h.text([h.X("210"),h.Y("18"),h.FontSize("12"),h.Fill("#536b86")],["Event order →"]),
          ...currentLanes.flatMap((lane,index)=>[h.text([h.X("12"),h.Y(String(58+index*48)),h.FontSize("13"),h.FontWeight("600"),h.Fill("#263c53")],[lane]),h.path([h.D(`M 200 ${74+index*48} H 1040`),h.Stroke("#dce5ef"),h.Fill("none")],[])]),
          block(0,210,150,"Record upcoming edit","#326dac"),
          block(1,370,110,"Perform edit","#536b86"),
          block(2,490,145,claude ? "Report edit" : "Report edit / reply","#326dac"),
          ...(claude ? [block(2,635,170,"Wait for review / result","#326dac")] : []),
          block(1,claude ? 815 : 645,claude ? 115 : 205,"Continue → Stop","#536b86"),
          block(3,530,105,"Record edit","#267b70"),block(3,645,100,"Prepare","#536b86"),block(3,755,240,"Jev review","#8b6618"),
          block(4,700,295,"May collect / deliver eligible findings","#76549a",true),
          block(5,claude ? 930 : 850,claude ? 105 : 185,"Wait for review","#76549a"),
          h.text([h.X("210"),h.Y("337"),h.FontSize("12"),h.Fill("#536b86")],["Repeat pre → edit → post for each edit; Stop follows any number of edits." ]),
        ]),
      ]),
      h.p([], ["Example: review is unfinished when Stop starts. The collector is a separate delivery path that may overlap the post hook and Stop; the dashed band is optional, not a step that must run after the post hook succeeds."]),
    ]);
  };
  return h.section([h.Id("post-edit-timing"),h.Class("chart-panel post-edit-timing"),h.AriaLabel("Installed hook timing and post-edit proposals")],[
    h.details([h.Open(true)], [
      h.summary([], ["Post-edit intake · hook timing"]),
      h.section([h.Id("current-hook-timing"),h.Class("current-hook-timing")],[
        h.h2([], ["Current installed hook timing"]),
        h.p([h.Class("post-edit-timing-scope")],["Ordering from current adapter code · illustrative, not measured durations. Representative successful edits; hook failures and time limits can take shorter paths."]),
        h.p([], ["The pre hook records the upcoming edit so its later review can be admitted; it does not read the changed source or wait for Jev. Reporting the completed edit uses that record and gives the resident work to prepare and review. If this pre-hook record fails, the native edit can still proceed."]),
        currentTrace("Claude Code"),currentTrace("Codex CLI"),
        h.div([h.Class("current-stop-paths")],[
          h.div([], [h.h3([], ["Stop: review unfinished"]),h.p([], ["Wait for known review work within the Stop time limit, then decide. Eligible findings can ask the agent to continue; otherwise allow closure. The time limit can also end the wait before review finishes."])]),
          h.div([], [h.h3([], ["Stop: nothing to wait for"]),h.p([], ["If no review is unfinished, decide without waiting for review. Ready findings may still ask the agent to continue; otherwise allow closure. There is no registration-grace wait on an empty current Stop."])]),
        ]),
      ]),
      h.section([h.Class("post-edit-proposals")],[
        h.h2([], ["Proposed alternatives · not installed behavior"]),
        h.p([h.Class("post-edit-timing-scope")],["Illustrative ordering, not measured durations. Installed flow still uses pre-edit permits and a synchronous post hook; these no-pre alternatives are proposals, not implemented behavior."]),
        h.p([], ["The hook's reply means the completed edit was recorded, not that review finished. Background preparation and Jev review are separate work. Band lengths do not represent durations."]),
        trace("receipt","A · Preferred: report the edit, then continue", "The hook reports the edit and returns; review continues in background. Stop waits for known unfinished review only within its time limit, and does not wait for review that has already settled."),
        trace("grace","B · Alternative: async post with Stop grace", "Stop first allows a limited window for a missing edit report. Grace consumes the same Stop time limit; received work gets only the remaining wait time. A post arriving after grace can still be missed. This trace returns at the time limit while review may continue; later work cannot reuse this Stop call."),
        trace("race","C · Counterexample: async post without grace", "Race in a fully async no-pre variant — not the installed baseline. Stop sees no recorded edit work and returns before the delayed post reaches the resident."),
      ]),
    ]),
  ]);
};
