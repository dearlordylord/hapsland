import type { HtmlBuilder } from "foldkit/html";
import { EVIDENCE_BASE, LANES, REDUCER_SEGMENTS, TIMELINE_CASES, type Lane, type TimelinePanel } from "./timeline";

const LEFT = 375;
const RIGHT = 1130;
const WIDTH = 1350;
const laneOrder = Object.keys(LANES) as Lane[];

const panelView = <Message>(h: HtmlBuilder<Message>, panel: TimelinePanel, maximum: number) => {
  const x = (milliseconds: number) => LEFT + milliseconds / maximum * (RIGHT - LEFT);
  let y = 78;
  const rows = laneOrder.flatMap((lane) => {
    const entries = panel.entries.filter((entry) => entry.lane === lane);
    if (entries.length === 0) return [];
    const headingY = y;
    y += 25;
    const rows = entries.map((entry) => {
      const rowY = y;
      y += 29;
      return { entry, y: rowY };
    });
    y += 15;
    return [{ lane, y: headingY, rows }];
  });
  const height = y + 12;
  return h.div([h.Class("timeline-panel")], [
    h.div([h.Class("timeline-panel-heading")], [h.h3([], [panel.title]), h.span([h.Class(`timeline-badge ${panel.status === "OBSERVED" ? "observed" : "unproven"}`)], [panel.status])]),
    h.div([h.Class("chart-scroll timeline-scroll")], [
      h.svg([h.ViewBox(`0 0 ${WIDTH} ${height}`), h.Role("img"), h.AriaLabel(`${panel.title}; seconds since native process launch; ${panel.outcome}`)], [
        h.text([h.X("18"), h.Y("25"), h.FontSize("12"), h.Fill("#52647d")], ["Observed timestamps · each row shares the same time axis"]),
        ...Array.from({ length: 6 }, (_, i) => {
          const at = maximum * i / 5;
          return h.g([], [
            h.path([h.D(`M ${x(at)} 52 L ${x(at)} ${height - 8}`), h.Stroke("#e4e9f0"), h.StrokeWidth("1")], []),
            h.text([h.X(String(x(at))), h.Y("43"), h.TextAnchor("middle"), h.FontSize("11"), h.Fill("#52647d")], [`${(at / 1000).toFixed(0)}s`]),
          ]);
        }),
        h.text([h.X("1160"), h.Y("43"), h.FontSize("11"), h.Fill("#52647d")], ["Recorded time"]),
        ...rows.flatMap(({ lane, y: headingY, rows }) => [
          h.text([h.X("18"), h.Y(String(headingY)), h.FontSize("12"), h.FontWeight("700"), h.Fill("#243e60")], [LANES[lane]]),
          ...rows.map(({ entry, y: rowY }) => {
            const unknown = entry.kind === "unknown";
            const color = unknown ? "#858c97" : lane === "result" ? "#31836a" : "#386eb1";
            const time = entry.until === undefined ? `${(entry.at / 1000).toFixed(3)}s` : `${(entry.at / 1000).toFixed(3)}–${(entry.until / 1000).toFixed(3)}s`;
            return h.g([], [
              h.text([h.X("29"), h.Y(String(rowY + 4)), h.FontSize("12"), h.Fill("#425570")], [entry.label]),
              h.path([h.D(`M ${LEFT} ${rowY} L ${RIGHT} ${rowY}`), h.Stroke("#f0f3f7"), h.StrokeWidth("1")], []),
              ...(entry.until === undefined ? [
                h.circle([h.Cx(String(x(entry.at))), h.Cy(String(rowY)), h.R("5"), h.Fill(color)], []),
              ] : [
                h.rect([h.X(String(x(entry.at))), h.Y(String(rowY - 6)), h.Width(String(Math.max(2, x(entry.until) - x(entry.at)))), h.Height("12"), h.Rx("3"), h.Fill(unknown ? "#e3e5e9" : "#dbe8fa"), h.Stroke(color), ...(unknown ? [h.StrokeDasharray("4 3")] : [])], []),
              ]),
              h.text([h.X("1160"), h.Y(String(rowY + 4)), h.FontSize("11"), h.Fill("#52647d")], [time]),
            ]);
          }),
        ]),
      ]),
    ]),
    h.p([h.Class("timeline-outcome")], [panel.outcome]),
  ]);
};

export const timelineView = <Message>(h: HtmlBuilder<Message>, selected: number, select: (index: number) => Message) => {
  const scenario = TIMELINE_CASES[selected] ?? TIMELINE_CASES[0];
  const segment = REDUCER_SEGMENTS[selected] ?? REDUCER_SEGMENTS[0];
  const maximum = Math.max(5000, Math.ceil(Math.max(...scenario.panels.flatMap((panel) => panel.entries.map((entry) => entry.until ?? entry.at))) / 5000) * 5000);
  return h.section([h.Class("card timeline-section")], [
    h.h2([], ["When advice can reach the agent"]),
    h.p([h.Class("timeline-context")], ["Linux · Codex 0.155.1 / Claude Code 2.1.218 · controlled Effect reviewer, not live Jev · selected retained runs, not universal latency bounds"]),
    h.div([h.Class("timeline-case-heading")], [
      h.h3([], [scenario.title]), h.span([h.Class("timeline-badge requirement")], [scenario.requirement]),
    ]),
    h.p([h.Class("description")], [scenario.summary]),
    h.p([h.Class("timeline-legend")], ["Blue: native observation · Green: observed outcome · Grey: missing evidence inside runtime. A write is not a receipt. Independent file checks have no retained timestamp and appear in the outcome text."]),
    ...scenario.panels.map((panel) => panelView(h, panel, maximum)),
    h.div([h.Class("trace-options timeline-options"), h.Role("group"), h.AriaLabel("Select timing scenario")], TIMELINE_CASES.map((item, index) =>
      h.button([h.OnClick(select(index)), h.Class(index === selected ? "trace selected" : "trace")], [item.title]))),
    h.div([h.Class("timeline-reducer")], [
      h.h3([], ["Reducer companion · event order, no measured seconds"]),
      h.p([h.Class("timeline-badge partial")], [segment.length ? "PARTIAL REDUCER COVERAGE" : "NATIVE OBSERVATIONS ONLY"]),
      h.p([h.Class("description")], [scenario.reducerScope]),
      ...(segment.length ? [
        h.ol([h.Class("timeline-steps")], segment.map((entry) => h.li([], [
          h.strong([], [`${entry.order + 1}. ${entry.label}`]),
          h.span([], [`${entry.roundActive ? "round active" : "round closed"} · ${entry.packets} live data item${entry.packets === 1 ? "" : "s"}`]),
        ]))),
        h.p([h.Class("description")], ["These steps use typed reducer events and labels from TRANSITIONS; stepFlow accepts their order. Native timestamps, unknown intervals and repair outcomes above are separate evidence, not reducer-verified facts."]),
      ] : []),
    ]),
    h.div([h.Class("timeline-sources")], [
      h.strong([], ["Retained evidence: "]),
      ...scenario.sources.map((source) => h.a([h.Href(`${EVIDENCE_BASE}${source}`)], [source])),
    ]),
  ]);
};
