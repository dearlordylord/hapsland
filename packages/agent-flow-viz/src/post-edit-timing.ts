import type { HtmlBuilder } from "foldkit/html";

/** Code-based installed-flow illustrations; no timing telemetry. */
export const postEditTimingView = <Message>(h: HtmlBuilder<Message>) => {
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
  return h.section([h.Id("post-edit-timing"),h.Class("chart-panel post-edit-timing"),h.AriaLabel("Installed hook timing")],[
    h.details([h.Open(true)], [
      h.summary([], ["Post-edit intake · hook timing"]),
      h.section([h.Id("current-hook-timing"),h.Class("current-hook-timing")],[
        h.h2([], ["Current installed hook timing"]),
        h.p([h.Class("post-edit-timing-scope")],["Ordering from current adapter code · illustrative, not measured durations. Representative successful edits; hook failures and time limits can take shorter paths."]),
        h.p([], ["The pre hook records the upcoming edit so its later review can be admitted; it does not read the changed source or wait for Jev. Reporting the completed edit uses that record and gives the resident work to prepare and review. If this pre-hook record fails, the native edit can still proceed."]),
        currentTrace("Claude Code"),currentTrace("Codex CLI"),
        h.div([h.Class("current-stop-paths")],[
          h.div([], [h.h3([], ["Stop: review unfinished"]),h.p([], ["Wait for known review work within the Stop time limit, then decide. Eligible findings can ask the agent to continue; otherwise allow closure. The time limit can also end the wait before review finishes."])]),
          h.div([], [h.h3([], ["Stop: nothing to wait for"]),h.p([], ["If no review is unfinished, decide without waiting for review. Ready findings may still ask the agent to continue; otherwise allow closure."])]),
        ]),
      ]),
    ]),
  ]);
};
