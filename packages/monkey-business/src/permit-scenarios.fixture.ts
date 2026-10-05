/** Curated bounded campaign inputs and expectations from the accepted permit contract.
 * Test-only data: no execution, production policy, or generated-core oracle. */
export const permitScenarioCases = (["success", "failure", "duplicate", "absent"] as const).flatMap((outcome) =>
  [9, 10, 11].map((durationMs) => ({
    outcome,
    durationMs,
    lifetimeMs: 10,
    consumed: (outcome === "success" || outcome === "duplicate") && durationMs <= 10 ? 1 : 0,
    rejectedPosts:
      outcome === "absent" ? 0 : durationMs > 10 ? (outcome === "duplicate" ? 2 : 1) : outcome === "duplicate" ? 1 : 0
  }))
)
