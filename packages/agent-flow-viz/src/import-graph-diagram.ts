import type { HtmlBuilder } from "foldkit/html";
import type { ImportGraphCommand, ImportGraphEvent, ImportGraphProjection } from "../../agent-flow-bend/import-graph-adapter";

export type ImportGraphStage = "resolve" | "gate" | "capture" | "expand" | "complete" | "incomplete";
type HistoryStep = { readonly unit: number; readonly event: ImportGraphEvent; readonly command: ImportGraphCommand; readonly state: ImportGraphProjection };
type FileNode = { readonly target: number; readonly status: "captured" | "discovered" | "read requested" | "blocked"; readonly reason?: string; readonly sourceBytes?: number; readonly treeBytes?: number; readonly sizeAccepted?: boolean; readonly acceptedTotal?: number };
type FileEdge = { readonly id: number; readonly from: number; to?: number; reason?: string; visited?: boolean };
type UnitGraph = { readonly nodes: Map<number, FileNode>; readonly edges: Map<number, FileEdge>; root?: number; resolving?: number; checking?: number; reading?: number };

// This is a display projection of native scenario facts and compiled Bend results.
// It never decides whether to follow, capture, or complete an import.
const projectFileGraphs = (unitCount: number, history: readonly HistoryStep[]): UnitGraph[] => {
  const graphs: UnitGraph[] = Array.from({ length: unitCount }, () => ({ nodes: new Map(), edges: new Map() }));
  for (const step of history) {
    const graph = graphs[step.unit];
    if (graph === undefined) throw new TypeError("unknown import diagram unit");
    const { event, command } = step;
    switch (event.kind) {
      case "root":
        if (step.state.files > 0) {
          graph.root = event.target;
          graph.nodes.set(event.target, { target: event.target, status: "captured", sourceBytes: event.sourceBytes, treeBytes: event.treeBytes, sizeAccepted: true, acceptedTotal: step.state.treeBytes });
          for (const id of event.edges) graph.edges.set(id, { id, from: event.target });
        }
        break;
      case "next":
        if (command.kind === "resolveEdge") graph.resolving = command.edge;
        if (command.kind === "unitIncomplete") {
          const edge = graph.edges.get(step.state.pending[0] ?? -1);
          if (edge !== undefined) edge.reason = command.reason;
        }
        break;
      case "resolved": {
        const edge = graph.resolving === undefined ? undefined : graph.edges.get(graph.resolving);
        if (edge !== undefined) {
          if (event.result === "found") {
            edge.to = event.target;
            const existing = graph.nodes.get(event.target);
            if (existing === undefined) graph.nodes.set(event.target, { target: event.target, status: "discovered" });
            else if (command.kind === "none") edge.visited = true;
          }
          if (command.kind === "unitIncomplete") edge.reason = command.reason;
        }
        if (command.kind === "checkPath") graph.checking = command.target;
        break;
      }
      case "pathChecked":
        if (command.kind === "readSource") {
          graph.reading = command.target;
          graph.nodes.set(command.target, { target: command.target, status: "read requested" });
        } else if ((command.kind === "unitIncomplete" || command.kind === "skipImport") && graph.checking !== undefined) {
          graph.nodes.set(graph.checking, { target: graph.checking, status: "blocked", reason: command.reason });
        }
        break;
      case "captured":
        if (graph.reading !== undefined) {
          if (command.kind === "none" && step.state.phase === "ready") {
            graph.nodes.set(graph.reading, { target: graph.reading, status: "captured", sourceBytes: event.sourceBytes, treeBytes: event.treeBytes, sizeAccepted: true, acceptedTotal: step.state.treeBytes });
            for (const id of event.edges) graph.edges.set(id, { id, from: graph.reading! });
          } else if (command.kind === "unitIncomplete" || command.kind === "skipImport") {
            graph.nodes.set(graph.reading, { target: graph.reading, status: "blocked", reason: command.reason, sourceBytes: event.sourceBytes, treeBytes: event.treeBytes, sizeAccepted: false, acceptedTotal: step.state.treeBytes });
          }
        }
        break;
      case "captureFailed":
        if (command.kind === "unitIncomplete" && graph.reading !== undefined) {
          graph.nodes.set(graph.reading, { target: graph.reading, status: "blocked", reason: command.reason });
        }
        break;
      case "deadlineReached":
        break;
    }
  }
  return graphs;
};

const treeLimitBytes = 20 * 1024;
const treeSize = (bytes: number) => bytes % 1024 === 0 ? `${bytes / 1024} KiB` : `${bytes} B`;

export const importTreeBudgetView = <Message>(h: HtmlBuilder<Message>, units: readonly string[],
  names: Readonly<Record<number, string>>, history: readonly HistoryStep[], states: readonly ImportGraphProjection[]) =>
  h.div([h.Class("import-tree-budgets")], projectFileGraphs(units.length, history).map((graph, unit) => {
    // Acceptance and cumulative totals come from the same Bend replay projection as the file graph.
    const accepted = [...graph.nodes.values()].filter((node) => node.sizeAccepted === true);
    const skipped = [...graph.nodes.values()].filter((node) => node.reason === "TreeLimit" && node.sizeAccepted === false);
    const used = states[unit]!.treeBytes;
    const remaining = treeLimitBytes - used;
    const name = (node: FileNode) => names[node.target] ?? `target #${node.target}`;
    const contributions = accepted.map((node) => `${name(node)}: ${treeSize(node.treeBytes!)} accepted; cumulative ${treeSize(node.acceptedTotal!)}`);
    const summary = `${units[unit]} tree budget: ${treeSize(used)} of 20 KiB accepted; ${treeSize(remaining)} remaining`;
    return h.div([h.Class("import-tree-budget")], [
      h.h3([], [summary]),
      h.div([h.Class("import-tree-bar"), h.Role("img"), h.AriaLabel([summary, ...contributions].join(". "))], [
        ...accepted.map((node) => h.span([h.Class("import-tree-segment"), h.Style({ width: `${node.treeBytes! / treeLimitBytes * 100}%` })], [name(node).replace(/\.ts$/, "")])),
        ...(remaining > 0 ? [h.span([h.Class("import-tree-remaining"), h.Style({ width: `${remaining / treeLimitBytes * 100}%` })], ["Free"])] : []),
      ]),
      h.ul([h.Class("import-tree-contributions"), h.AriaLabel("Accepted tree contributions in traversal order")], contributions.map((label) => h.li([], [label]))),
      h.p([h.Class("import-tree-skipped")], [skipped.length ? `Skipped by Bend: ${skipped.map((node) => `${name(node)} (${treeSize(node.treeBytes!)} reported)`).join(", ")}. These files use no bar space.` : "No tree-budget skips in the replay so far."]),
    ]);
  }));

const fileGraph = <Message>(h: HtmlBuilder<Message>, units: readonly string[],
  names: Readonly<Record<number, string>>, history: readonly HistoryStep[], states: readonly ImportGraphProjection[]) => {
  const graphs = projectFileGraphs(units.length, history);
  let rowTop = 50;
  const rows = graphs.map((graph, unit) => {
    const vertices: Array<{ key: string; node?: FileNode; edge?: FileEdge }> = [];
    for (const node of graph.nodes.values()) vertices.push({ key: `target:${node.target}`, node });
    for (const edge of graph.edges.values()) {
      if (edge.to === undefined) vertices.push({ key: `edge:${edge.id}`, edge });
    }
    const depths = new Map<string, number>();
    if (graph.root !== undefined) depths.set(`target:${graph.root}`, 0);
    for (let pass = 0; pass < graph.nodes.size; pass++) {
      for (const edge of graph.edges.values()) {
        const parentDepth = depths.get(`target:${edge.from}`);
        const child = edge.to === undefined ? `edge:${edge.id}` : `target:${edge.to}`;
        if (parentDepth !== undefined && !depths.has(child)) depths.set(child, parentDepth + 1);
      }
    }
    const levels = new Map<number, typeof vertices>();
    for (const vertex of vertices) {
      const depth = depths.get(vertex.key) ?? 0;
      const level = levels.get(depth) ?? [];
      level.push(vertex);
      levels.set(depth, level);
    }
    const maxCount = Math.max(1, ...[...levels.values()].map((level) => level.length));
    const positions = new Map<string, { x: number; y: number }>();
    for (const [depth, level] of levels) {
      level.forEach((vertex, index) => positions.set(vertex.key, {
        x: 25 + depth * 270,
        y: rowTop + (maxCount - level.length) * 75 + index * 150,
      }));
    }
    const top = rowTop;
    rowTop += maxCount * 150 + 40;
    return { graph, unit, vertices, positions, top, depthCount: levels.size };
  });
  const width = Math.max(920, ...rows.map((row) => 40 + row.depthCount * 270));
  const height = Math.max(130, rowTop);
  return h.svg([h.ViewBox(`0 0 ${width} ${height}`), h.Role("img"),
    h.AriaLabel("Import graph projected from native example facts and compiled Bend transition results. File colors and outcomes follow Bend commands and state.")], [
    h.defs([], [h.marker([h.Id("file-import-arrow"), h.ViewBox("0 0 10 10"), h.RefX("9"), h.RefY("5"), h.MarkerWidth("7"), h.MarkerHeight("7"), h.Orient("auto")], [h.path([h.D("M 0 0 L 10 5 L 0 10 z"), h.Fill("#687e98")], [])])]),
    h.text([h.X("25"), h.Y("23"), h.FontSize("13"), h.FontWeight("700"), h.Fill("#1e3048")], ["IMPORT / REFERENCE GRAPH · replayed example facts"]),
    ...(rows.every((row) => row.vertices.length === 0) ? [h.text([h.X("25"), h.Y("83"), h.FontSize("13"), h.Fill("#52647d")], ["Advance the scenario to capture a root and reveal its imports."])] : []),
    ...rows.flatMap(({ graph, unit, vertices, positions, top }) => {
      if (vertices.length === 0) return [];
      const unitStatus = states[unit]?.phase ?? "idle";
      const elements = [h.text([h.X("25"), h.Y(String(top - 10)), h.FontSize("11"), h.FontWeight("700"), h.Fill("#52647d")], [`${units[unit]} review unit · ${unitStatus}`])];
      for (const edge of graph.edges.values()) {
        const from = positions.get(`target:${edge.from}`);
        const to = positions.get(edge.to === undefined ? `edge:${edge.id}` : `target:${edge.to}`);
        if (from === undefined || to === undefined) continue;
        const backwards = to.x <= from.x;
        const path = backwards ? `M ${from.x + 88} ${from.y + 126} L ${from.x + 88} ${from.y + 138} L ${to.x + 88} ${to.y + 138} L ${to.x + 88} ${to.y + 126}` :
          `M ${from.x + 175} ${from.y + 63} C ${from.x + 220} ${from.y + 63}, ${to.x - 50} ${to.y + 63}, ${to.x - 8} ${to.y + 63}`;
        elements.push(h.g([], [
          h.path([h.D(path), h.Fill("none"), h.Stroke("#687e98"), h.StrokeWidth("2"), h.MarkerEnd("url(#file-import-arrow)")], []),
          h.text([h.X(String(backwards ? (from.x + to.x) / 2 + 58 : (from.x + to.x) / 2 + 92)), h.Y(String(backwards ? Math.max(from.y, to.y) + 137 : (from.y + to.y) / 2 + 49)), h.FontSize("11"), h.Fill("#52647d")], [edge.visited ? `cycle #${edge.id}` : `#${edge.id}`]),
        ]));
      }
      for (const vertex of vertices) {
        const { x, y } = positions.get(vertex.key)!;
        const node = vertex.node;
        const edge = vertex.edge;
        const blocked = node?.status === "blocked" || edge?.reason !== undefined;
        const completeRoot = node?.target === graph.root && states[unit]?.phase === "complete";
        const fill = blocked ? "#fff0eb" : completeRoot ? "#e3f3eb" : node?.status === "captured" ? "#e5efff" : "#f5f7fa";
        const stroke = blocked ? "#d76546" : completeRoot ? "#31836a" : node?.status === "captured" ? "#527cc4" : "#a3afbf";
        const name = node === undefined ? `import #${edge!.id}` : names[node.target] ?? `target #${node.target}`;
        const detail = node?.reason ?? edge?.reason ?? (node?.status === "captured" ? node.target === graph.root ? "captured root" : "captured support" : node?.status ?? "pending resolution");
        const sizeKind = node?.sizeAccepted === false ? "reported" : "accepted";
        const treeSize = node?.treeBytes === undefined ? "tree size unknown" : `${sizeKind} tree +${node.treeBytes} B`;
        const sourceSize = node?.sourceBytes === undefined ? "source size unknown" : `${sizeKind} source ${node.sourceBytes} B`;
        const total = node?.acceptedTotal === undefined ? "accepted total unknown" : `accepted total ${node.acceptedTotal} B`;
        elements.push(h.g([], [
          h.rect([h.X(String(x)), h.Y(String(y)), h.Width("175"), h.Height("126"), h.Rx("10"), h.Fill(fill), h.Stroke(stroke), h.StrokeWidth("2")], []),
          h.text([h.X(String(x + 13)), h.Y(String(y + 28)), h.FontSize("17"), h.FontWeight("700"), h.Fill("#1e3048")], [name]),
          h.text([h.X(String(x + 13)), h.Y(String(y + 51)), h.FontSize("11"), h.Fill("#52647d")], [detail]),
          h.text([h.X(String(x + 13)), h.Y(String(y + 75)), h.FontSize("10"), h.Fill("#52647d")], [treeSize]),
          h.text([h.X(String(x + 13)), h.Y(String(y + 92)), h.FontSize("10"), h.Fill("#52647d")], [sourceSize]),
          h.text([h.X(String(x + 13)), h.Y(String(y + 110)), h.FontSize("10"), h.Fill("#52647d")], [total]),
        ]));
      }
      return elements;
    }),
  ]);
};
const nodes = [
  { id: "resolve", x: 30, y: 50, title: "Next pending edge", owner: "BEND DECISION", detail: "Keep exploring after a skipped import", role: "bend" },
  { id: "gate", x: 330, y: 50, title: "Permission and budgets", owner: "BEND DECISION", detail: "Allow before any source read", role: "bend" },
  { id: "capture", x: 630, y: 50, title: "Capture allowed target", owner: "NATIVE FACT", detail: "Report source and tree bytes", role: "native" },
  { id: "expand", x: 630, y: 260, title: "Accept or skip import", owner: "BEND DECISION", detail: "20 KiB cap; keep later edges", role: "bend" },
  { id: "complete", x: 330, y: 260, title: "Complete unit", owner: "BEND DECISION", detail: "Eligible for a Jev request", role: "bend" },
  { id: "incomplete", x: 30, y: 260, title: "Incomplete unit", owner: "BEND DECISION", detail: "No Jev request for this unit", role: "bend" },
] as const;

export const importGraphDiagram = <Message>(h: HtmlBuilder<Message>, active: ImportGraphStage | null, units: readonly string[], names: Readonly<Record<number, string>>, history: readonly HistoryStep[], states: readonly ImportGraphProjection[], unitLabel: string) =>
  h.div([h.Class("chart-scroll import-graph-diagram")], [
    fileGraph(h, units, names, history, states),
    h.p([h.Class("import-graph-diagram-caption")], [`Import process schematic · highlighted Bend phase for ${unitLabel}`]),
    h.svg([h.ViewBox("0 0 920 505"), h.Role("img"), h.AriaLabel("Import process schematic. Bend skips denied paths before reading source and continues pending edges. It accepts or skips captured import contributions against the 20 KiB tree bound, then ends a unit with skipped imports incomplete.")], [
      h.defs([], [h.marker([h.Id("import-arrow"), h.ViewBox("0 0 10 10"), h.RefX("9"), h.RefY("5"), h.MarkerWidth("7"), h.MarkerHeight("7"), h.Orient("auto")], [h.path([h.D("M 0 0 L 10 5 L 0 10 z"), h.Fill("#687e98")], [])])]),
      ...[
        ["M 280 102 L 330 102", "found", 290, 88],
        ["M 580 102 L 630 102", "allow", 590, 88],
        ["M 755 155 L 755 260", "reported bytes", 765, 218],
        ["M 630 312 L 580 312", "done, no skips", 583, 298],
        ["M 455 155 L 455 207 L 155 207 L 155 260", "exhausted with skips", 206, 198],
        ["M 30 102 L 10 102 L 10 312 L 30 312", "", 0, 0],
        ["M 880 312 L 905 312 L 905 20 L 155 20 L 155 50", "more edges / cycle skipped", 590, 15],
      ].map(([path, label, x, y]) => h.g([], [
        h.path([h.D(String(path)), h.Fill("none"), h.Stroke("#687e98"), h.StrokeWidth("2"), h.MarkerEnd("url(#import-arrow)")], []),
        h.text([h.X(String(x)), h.Y(String(y)), h.FontSize("11"), h.Fill("#52647d")], [String(label)]),
      ])),
      h.text([h.X("40"), h.Y("182"), h.FontSize("11"), h.FontWeight("700"), h.Fill("#9a4229")], ["TreeLimit: skip that import, inspect later edges"]),
      h.text([h.X("40"), h.Y("224"), h.FontSize("11"), h.FontWeight("700"), h.Fill("#9a4229")], ["Excluded: skip without reading, inspect later edges"]),
      h.text([h.X("40"), h.Y("240"), h.FontSize("11"), h.Fill("#52647d")], ["TreeLimit takes precedence over Excluded at completion"]),
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
