import type { HtmlBuilder } from "foldkit/html";

/** Advisory sequences only: neither timing telemetry nor implemented hook policy. */
export const postEditTimingView = <Message>(h: HtmlBuilder<Message>) => {
  const lanes = ["Agent edit", "Post receipt", "Resident", "Jev", "Stop"];
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
      band(1,300,165,"Bounded receipt / ack","#326dac"),
      band(2,330,105,"Register","#267b70"),band(2,470,150,"Background prep","#536b86"),
      band(3,620,185,"Review in background","#8b6618"),
      band(4,650,155,"Wait for known work","#76549a"),band(4,815,130,"Settled: return","#76549a"),
      arrow(375,1,2),arrow(620,2,3),
    ] : kind === "grace" ? [
      band(0,180,105,"Edit ends","#536b86"),band(0,300,170,"Continues → calls Stop","#536b86"),
      band(1,490,175,"Async post arrives","#326dac"),
      band(2,535,110,"Register","#267b70"),band(2,650,145,"Background prep","#536b86"),
      band(3,795,145,"Background review","#8b6618"),
      band(4,470,180,"Bounded receipt grace","#76549a",true),band(4,650,160,"Remaining wait budget","#76549a"),band(4,820,125,"Deadline return","#76549a"),
      arrow(585,1,2),arrow(795,2,3),
    ] : [
      band(0,180,105,"Edit ends","#536b86"),band(0,300,170,"Continues → calls Stop","#536b86"),
      band(1,650,175,"Delayed async post","#326dac"),
      band(2,700,125,"Register too late","#267b70"),
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
  return h.section([h.Id("post-edit-timing"),h.Class("chart-panel post-edit-timing"),h.AriaLabel("Post-edit intake timing proposals")],[
    h.details([h.Open(true)], [
      h.summary([], ["Post-edit intake · timing proposals"]),
      h.p([h.Class("post-edit-timing-scope")],["Illustrative ordering, not measured durations. Installed flow still uses pre-edit permits and a synchronous post hook; these no-pre alternatives are proposals, not implemented behavior."]),
      h.p([], ["Receipt acknowledges registration; it does not mean review is complete. Resident preparation and Jev review run separately in the background. Band lengths do not represent durations."]),
      trace("receipt","A · Preferred: register before acknowledging", "The foreground post hook waits only for bounded registration, never for Jev. Stop sees known unfinished work, waits within its configured deadline, and returns immediately if that work is already settled."),
      trace("grace","B · Alternative: async post with Stop grace", "Stop first allows a bounded window for a missing registration. Grace consumes the same Stop deadline; received work gets only the remaining wait budget. A post arriving after grace can still be missed. This trace returns at the deadline while review may continue; later work cannot reuse this Stop call."),
      trace("race","C · Counterexample: async post without grace", "Race in a fully async no-pre variant — not the installed baseline. Stop sees no registered work and returns before the delayed post reaches the resident."),
    ]),
  ]);
};
