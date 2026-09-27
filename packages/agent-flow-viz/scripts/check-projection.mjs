import { createServer } from "vite";

// TypeScript checks event coverage and route shape. This build-time replay
// checks the guards and ordering that cannot be proved from those types alone.
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const graph = await server.ssrLoadModule("/src/generation.ts");
  const timing = await server.ssrLoadModule("/src/timeline.ts");
  if (graph.CONNECTIONS.length === 0 || timing.REDUCER_SEGMENTS.length !== timing.TIMELINE_CASES.length) {
    throw new Error("Incomplete model projection");
  }
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[0-9a-f]{40}\/evidence\/.+\/$/.test(timing.EVIDENCE_BASE)) {
    throw new Error("Native timing evidence must link to a pinned repository commit");
  }
  for (const scenario of timing.TIMELINE_CASES) {
    const declared = new Set(scenario.sources);
    for (const source of declared) {
      if (source.includes("/") || source.includes("..") || !/^[a-z0-9][a-z0-9.-]*$/i.test(source)) {
        throw new Error(`Invalid pinned source name for ${scenario.title}: ${source}`);
      }
    }
    for (const panel of scenario.panels) {
      for (const entry of panel.entries) {
        if (entry.kind === "native observation" && !declared.has(entry.source)) {
          throw new Error(`Undeclared native source for ${scenario.title}: ${entry.source}`);
        }
        if (!Number.isFinite(entry.at) || entry.at < 0 ||
            (entry.until !== undefined && (!Number.isFinite(entry.until) || entry.until < entry.at))) {
          throw new Error(`Invalid displayed timing in ${scenario.title}: ${entry.label}`);
        }
      }
    }
  }
  process.stdout.write(`Projected ${graph.PROJECTED_TRACES.length} guided scenarios and ${timing.REDUCER_SEGMENTS.length} timeline companions.\n`);
} finally {
  await server.close();
}
