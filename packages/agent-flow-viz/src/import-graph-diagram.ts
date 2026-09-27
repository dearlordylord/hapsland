import type { HtmlBuilder } from "foldkit/html";

export type ImportGraphStage = "resolve" | "gate" | "capture" | "expand" | "complete" | "incomplete";
const nodes = [
  { id: "resolve", x: 30, y: 50, title: "Resolve next edge", owner: "NATIVE FACT", detail: "Syntax, path, binding, identity", role: "native" },
  { id: "gate", x: 330, y: 50, title: "Permission and budgets", owner: "BEND DECISION", detail: "Allow before any source read", role: "bend" },
  { id: "capture", x: 630, y: 50, title: "Capture allowed target", owner: "NATIVE FACT", detail: "Bytes and discovered edges", role: "native" },
  { id: "expand", x: 630, y: 260, title: "Track pending / visited", owner: "BEND DECISION", detail: "Order edges; stop cycles", role: "bend" },
  { id: "complete", x: 330, y: 260, title: "Complete unit", owner: "BEND DECISION", detail: "Eligible for a Jev request", role: "bend" },
  { id: "incomplete", x: 30, y: 260, title: "Incomplete unit", owner: "BEND DECISION", detail: "No Jev request for this unit", role: "bend" },
] as const;

export const importGraphDiagram = <Message>(h: HtmlBuilder<Message>, active: ImportGraphStage | null) =>
  h.div([h.Class("chart-scroll import-graph-diagram")], [
    h.svg([h.ViewBox("0 0 920 505"), h.Role("img"), h.AriaLabel("Import exploration state machine. Native resolution facts enter Bend permission and budget gates before native source capture. Bend tracks edges and decides complete or incomplete; only complete units are eligible for Jev.")], [
      h.defs([], [h.marker([h.Id("import-arrow"), h.ViewBox("0 0 10 10"), h.RefX("9"), h.RefY("5"), h.MarkerWidth("7"), h.MarkerHeight("7"), h.Orient("auto")], [h.path([h.D("M 0 0 L 10 5 L 0 10 z"), h.Fill("#687e98")], [])])]),
      ...[
        ["M 280 102 L 330 102", "found", 290, 88],
        ["M 580 102 L 630 102", "allow", 590, 88],
        ["M 755 155 L 755 260", "captured", 765, 218],
        ["M 630 312 L 580 312", "done", 590, 298],
        ["M 455 155 L 455 207 L 155 207 L 155 260", "excluded / exhausted", 206, 198],
        ["M 30 102 L 10 102 L 10 312 L 30 312", "", 0, 0],
        ["M 880 312 L 905 312 L 905 20 L 155 20 L 155 50", "more edges / cycle skipped", 590, 15],
      ].map(([path, label, x, y]) => h.g([], [
        h.path([h.D(String(path)), h.Fill("none"), h.Stroke("#687e98"), h.StrokeWidth("2"), h.MarkerEnd("url(#import-arrow)")], []),
        h.text([h.X(String(x)), h.Y(String(y)), h.FontSize("11"), h.Fill("#52647d")], [String(label)]),
      ])),
      h.text([h.X("40"), h.Y("240"), h.FontSize("11"), h.Fill("#52647d")], ["Missing / ambiguous targets also end incomplete"]),
      ...nodes.map((node) => h.g([], [
        h.rect([h.X(String(node.x)), h.Y(String(node.y)), h.Width("250"), h.Height("105"), h.Rx("10"), h.Fill(node.role === "bend" ? "#e5efff" : "#edf1f6"), h.Stroke(active === node.id ? "#e66035" : node.role === "bend" ? "#527cc4" : "#738399"), h.StrokeWidth(active === node.id ? "4" : "2")], []),
        h.text([h.X(String(node.x + 14)), h.Y(String(node.y + 22)), h.FontSize("10"), h.FontWeight("700"), h.Fill("#52647d")], [node.owner]),
        h.text([h.X(String(node.x + 14)), h.Y(String(node.y + 49)), h.FontSize("16"), h.FontWeight("700"), h.Fill("#1e3048")], [node.title]),
        h.text([h.X(String(node.x + 14)), h.Y(String(node.y + 78)), h.FontSize("12"), h.Fill("#52647d")], [node.detail]),
      ])),
      h.path([h.D("M 455 365 L 455 412"), h.Stroke("#687e98"), h.StrokeWidth("2"), h.MarkerEnd("url(#import-arrow)")], []),
      h.rect([h.X("280"), h.Y("415"), h.Width("350"), h.Height("70"), h.Rx("10"), h.Fill("#e3f3eb"), h.Stroke("#31836a"), h.StrokeWidth("2")], []),
      h.text([h.X("300"), h.Y("440"), h.FontSize("13"), h.FontWeight("700"), h.Fill("#205f4a")], ["JEV OUTCOME · downstream boundary"]),
      h.text([h.X("300"), h.Y("464"), h.FontSize("12"), h.Fill("#205f4a")], ["Finding / clear / unavailable: not simulated here"]),
    ]),
  ]);
