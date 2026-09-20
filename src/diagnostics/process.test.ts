import { describe, expect, it } from "@effect/vitest";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type ProcessObservation = {
  readonly status: "healthy" | "problem";
  readonly suppressed: boolean;
  readonly notification?: { readonly kind: "problem" | "recovery"; readonly changed: boolean };
};

const processScript = `
  import * as Effect from "effect/Effect";
  import { healthyDiagnosticEvent, problemDiagnosticEvent } from "./src/diagnostics/domain.ts";
  import { DiagnosticStore } from "./src/diagnostics/store.ts";
  const input = JSON.parse(process.env.DIAGNOSTIC_EVENT ?? "{}");
  const scope = input.scope;
  const event = input.status === "healthy"
    ? healthyDiagnosticEvent(scope)
    : problemDiagnosticEvent(scope, input.problem);
  const result = await Effect.runPromise(
    DiagnosticStore.Service.pipe(
      Effect.flatMap((store) => store.observe(event)),
      Effect.provide(DiagnosticStore.layer({ statePath: process.env.DIAGNOSTIC_STATE_PATH })),
    ),
  );
  process.stdout.write(JSON.stringify(result));
`;

const spawnObservation = (
  statePath: string,
  event: unknown,
): Promise<ProcessObservation> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", processScript],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DIAGNOSTIC_STATE_PATH: statePath,
          DIAGNOSTIC_EVENT: JSON.stringify(event),
          DIAGNOSTIC_SECRET_SENTINEL: "SECRET_SENTINEL_MUST_NOT_APPEAR",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`diagnostic process failed (${String(code)}): ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as ProcessObservation);
      } catch {
        reject(new Error(`diagnostic process returned malformed output: ${stdout}`));
      }
    });
  });

const scope = {
  sessionId: "session-1",
  repository: "repo-1",
  backend: "jev",
};
const credentials = {
  code: "missing_credentials",
  identity: "missing-credentials",
};
const outage = {
  code: "backend_outage",
  identity: "backend-unavailable",
};
const timeout = {
  code: "backend_outage",
  identity: "backend-timeout",
};

describe("diagnostic process boundary", () => {
  it("keeps structured outcomes while suppressing repeated and changed lifecycle notices", async () => {
    const statePath = await mkdtemp(join(tmpdir(), "diagnostic-process-"));
    try {
      const healthy = await spawnObservation(statePath, { scope, status: "healthy" });
      const problem = await spawnObservation(statePath, {
        scope,
        status: "problem",
        problem: credentials,
      });
      const repeated = await spawnObservation(statePath, {
        scope,
        status: "problem",
        problem: credentials,
      });
      const changed = await spawnObservation(statePath, {
        scope,
        status: "problem",
        problem: outage,
      });
      const recovered = await spawnObservation(statePath, { scope, status: "healthy" });
      const quiet = await spawnObservation(statePath, { scope, status: "healthy" });

      expect(healthy).toMatchObject({ status: "healthy", suppressed: false });
      expect(problem.notification).toMatchObject({ kind: "problem", changed: false });
      expect(repeated).toMatchObject({ status: "problem", suppressed: true });
      expect(repeated.notification).toBeUndefined();
      expect(changed.notification).toMatchObject({ kind: "problem", changed: true });
      expect(recovered.notification).toMatchObject({ kind: "recovery" });
      expect(quiet).toMatchObject({ status: "healthy", suppressed: false });
      expect(quiet.notification).toBeUndefined();

      const entries = await readdir(statePath);
      for (const entry of entries) {
        const content = await readFile(join(statePath, entry), "utf8");
        expect(content).not.toContain("SECRET_SENTINEL");
      }
    } finally {
      await rm(statePath, { recursive: true, force: true });
    }
  });

  it("deduplicates concurrent processes and isolates identities", async () => {
    const statePath = await mkdtemp(join(tmpdir(), "diagnostic-process-concurrent-"));
    try {
      const concurrent = await Promise.all(
        Array.from({ length: 8 }, () =>
          spawnObservation(statePath, {
            scope,
            status: "problem",
            problem: timeout,
          }),
        ),
      );
      expect(concurrent.filter((entry) => entry.notification !== undefined)).toHaveLength(1);
      expect(concurrent.every((entry) => entry.status === "problem")).toBe(true);

      const separateSession = await spawnObservation(statePath, {
        scope: { ...scope, sessionId: "session-2" },
        status: "problem",
        problem: timeout,
      });
      const separateRepository = await spawnObservation(statePath, {
        scope: { ...scope, repository: "repo-2" },
        status: "problem",
        problem: timeout,
      });
      const separateBackend = await spawnObservation(statePath, {
        scope: { ...scope, backend: "other" },
        status: "problem",
        problem: timeout,
      });
      expect(separateSession.notification).toBeDefined();
      expect(separateRepository.notification).toBeDefined();
      expect(separateBackend.notification).toBeDefined();
    } finally {
      await rm(statePath, { recursive: true, force: true });
    }
  });
});
