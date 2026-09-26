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
  process.stdout.write(`Projected ${graph.PROJECTED_TRACES.length} guided scenarios and ${timing.REDUCER_SEGMENTS.length} timeline companions.\n`);
} finally {
  await server.close();
}
