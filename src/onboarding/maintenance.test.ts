import * as Effect from "effect/Effect";
import { expect, it, vi } from "vitest";
import { maintainClients, maintainHost, type MaintenancePorts } from "./maintenance.ts";
import { profileFields, type invokeLifecycle } from "./client-lifecycle.ts";
import type { SetupClient } from "./client-selection.ts";

type Result = Effect.Success<ReturnType<typeof invokeLifecycle>>;
const digest = "a".repeat(64);
const preview: Result = { status: "preview", proposal: { digest, changes: ["owned hook"] } };
const fixture = (
  options: {
    installed?: boolean;
    inspection?: Effect.Effect<unknown, unknown>;
    responses?: Array<Effect.Effect<Result, unknown>>;
    confirmation?: Effect.Effect<boolean, unknown>;
    activation?: Effect.Effect<void, unknown>;
  } = {},
) => {
  const responses = [...(options.responses ?? [Effect.succeed(preview), Effect.succeed({ status: "complete" })])];
  const ports: MaintenancePorts = {
    fields: (host) => profileFields(host, new Map([[`--${host}-home`, "/selected/profile"]])),
    installed: () => options.installed ?? false,
    inspect: () => options.inspection ?? Effect.succeed({}),
    invoke: vi.fn(() => responses.shift() ?? Effect.fail(new Error("unexpected invocation"))),
    activate: Effect.sync(() => activations.push("activate")).pipe(Effect.andThen(options.activation ?? Effect.void)),
    confirm: vi.fn(() => options.confirmation ?? Effect.succeed(true)),
    write: (text) => output.push(text),
    reportFailure: (host, cause) => failures.push({ host, cause }),
  };
  const output: string[] = [];
  const activations: string[] = [];
  const failures: Array<{ host: SetupClient; cause: unknown }> = [];
  return { ports, output, activations, failures };
};

it.each([
  { command: "repair" as const, host: "codex" as const, installed: true, operation: "install" },
  { command: "repair" as const, host: "claude" as const, installed: true, operation: "update" },
  { command: "repair" as const, host: "claude" as const, installed: false, operation: "install" },
  { command: "reinstall" as const, host: "claude" as const, installed: true, operation: "install" },
  { command: "reinstall" as const, host: "codex" as const, installed: true, operation: "install" },
  { command: "uninstall" as const, host: "codex" as const, installed: true, operation: "uninstall" },
])(
  "previews and applies $command for $host as $operation with the approved digest",
  async ({ command, host, installed, operation }) => {
    const f = fixture({ installed });
    await Effect.runPromise(maintainHost(command, host, f.ports));
    const fields = profileFields(host, new Map([[`--${host}-home`, "/selected/profile"]]));
    const reinstall = command === "reinstall" ? { reinstall: true } : {};
    expect(f.ports.invoke).toHaveBeenNthCalledWith(1, host, {
      version: 1,
      ...fields,
      operation: operation === "uninstall" ? operation : `${operation}-preview`,
      ...reinstall,
    });
    expect(f.ports.invoke).toHaveBeenNthCalledWith(2, host, {
      version: 1,
      ...fields,
      operation,
      proposalDigest: digest,
      ...reinstall,
    });
    expect(f.activations).toHaveLength(operation === "uninstall" ? 0 : 1);
    expect(f.failures).toEqual([]);
    expect(f.output.join("")).toContain("User settings and credentials preserved.");
  },
);

it.each(["install", "update", "uninstall"])(
  "repairs an interrupted %s using its retained operation",
  async (operation) => {
    const f = fixture({ inspection: Effect.succeed({ recovery: { operation } }) });
    await Effect.runPromise(maintainHost("repair", "codex", f.ports));
    expect(f.ports.invoke).toHaveBeenNthCalledWith(
      2,
      "codex",
      expect.objectContaining({ operation, proposalDigest: digest }),
    );
    expect(f.output.join("")).toContain(`Resume interrupted ${operation}`);
  },
);

it("keeps unrecognized recovery metadata out of the requested mutation", async () => {
  const f = fixture({ inspection: Effect.succeed({ recovery: { operation: "other" } }), installed: true });
  await Effect.runPromise(maintainHost("repair", "claude", f.ports));
  expect(f.ports.invoke).toHaveBeenNthCalledWith(2, "claude", expect.objectContaining({ operation: "update" }));
});

it.each(["repair", "uninstall"] as const)(
  "stops %s without confirmation when the preview has no changes",
  async (command) => {
    const f = fixture({ responses: [Effect.succeed({ ...preview, proposal: { digest, changes: [] } })] });
    await Effect.runPromise(maintainHost(command, "codex", f.ports));
    expect(f.ports.invoke).toHaveBeenCalledTimes(1);
    expect(f.ports.confirm).not.toHaveBeenCalled();
    expect(f.output.join("")).toContain(command === "uninstall" ? "already removed" : "integration intact");
  },
);
it("reports an already removed integration without requesting approval", async () => {
  const f = fixture({ responses: [Effect.succeed({ status: "already-uninstalled" })] });
  await Effect.runPromise(maintainHost("uninstall", "codex", f.ports));
  expect(f.ports.confirm).not.toHaveBeenCalled();
  expect(f.output).toEqual(["codex: already removed.\n"]);
});
it("honors a declined mutation", async () => {
  const f = fixture({ confirmation: Effect.succeed(false) });
  await Effect.runPromise(maintainHost("repair", "codex", f.ports));
  expect(f.ports.invoke).toHaveBeenCalledTimes(1);
  expect(f.output.join("")).toContain("codex: skipped.");
  expect(f.activations).toEqual([]);
});

it.each(["inspect", "preview", "confirm", "apply", "activate"] as const)(
  "reports a failed %s and stops the host operation",
  async (stage) => {
    const failure = new Error(stage);
    const f = fixture({
      ...(stage === "inspect" ? { inspection: Effect.fail(failure) } : {}),
      ...(stage === "preview" ? { responses: [Effect.fail(failure)] } : {}),
      ...(stage === "confirm" ? { confirmation: Effect.fail(failure) } : {}),
      ...(stage === "apply" ? { responses: [Effect.succeed(preview), Effect.fail(failure)] } : {}),
      ...(stage === "activate" ? { activation: Effect.fail(failure) } : {}),
    });
    await Effect.runPromise(maintainHost("repair", "codex", f.ports));
    expect(f.failures).toEqual([{ host: "codex", cause: failure }]);
    expect(f.output.join("")).not.toContain("User settings and credentials preserved.");
  },
);

it.each([{ status: "conflict" }, { status: "preview" }])("rejects invalid preview %j", async (response) => {
  const f = fixture({ responses: [Effect.succeed(response)] });
  await Effect.runPromise(maintainHost("repair", "codex", f.ports));
  expect(f.failures).toHaveLength(1);
  expect(f.ports.confirm).not.toHaveBeenCalled();
});
it("rejects malformed inspection recovery before invoking a mutation", async () => {
  const f = fixture({ inspection: Effect.succeed({ recovery: { operation: 1 } }) });
  await Effect.runPromise(maintainHost("repair", "codex", f.ports));
  expect(f.failures).toHaveLength(1);
  expect(f.ports.invoke).not.toHaveBeenCalled();
});

it.each([
  { command: "repair" as const, status: "partial", activationFailure: false, activations: 1 },
  { command: "repair" as const, status: "partial", activationFailure: true, activations: 1 },
  { command: "uninstall" as const, status: "partial", activationFailure: false, activations: 0 },
  { command: "repair" as const, status: "conflict", activationFailure: false, activations: 0 },
])(
  "retains uncertain $command results without reporting success: $status",
  async ({ command, status, activationFailure, activations }) => {
    const f = fixture({
      responses: [Effect.succeed(preview), Effect.succeed({ status })],
      ...(activationFailure ? { activation: Effect.fail(new Error("activation failed")) } : {}),
    });
    await Effect.runPromise(maintainHost(command, "codex", f.ports));
    expect(f.activations).toHaveLength(activations);
    expect(f.failures).toHaveLength(1);
    expect(f.output.join("")).not.toContain("User settings and credentials preserved.");
  },
);

it.each(["repair", "reinstall", "uninstall"] as const)(
  "requires a terminal for %s before inspecting profiles",
  async (command) => {
    const f = fixture();
    const registered = vi.fn(() => []);
    await expect(
      Effect.runPromise(
        maintainClients(command, { terminal: false, host: undefined, flags: new Map(), registered }, f.ports),
      ),
    ).rejects.toThrow("needs a terminal");
    expect(registered).not.toHaveBeenCalled();
    expect(f.ports.invoke).not.toHaveBeenCalled();
  },
);
it.each(["repair", "reinstall", "uninstall"] as const)("handles %s without registrations", async (command) => {
  const f = fixture();
  await Effect.runPromise(
    maintainClients(command, { terminal: true, host: undefined, flags: new Map(), registered: () => [] }, f.ports),
  );
  expect(f.activations).toHaveLength(command === "reinstall" ? 1 : 0);
  expect(f.output).toEqual(["No Hapsland integrations found. Run hapsland setup first.\n"]);
});
it("maintains only an explicitly selected host", async () => {
  const f = fixture();
  const registered = vi.fn(() => ["claude" as const]);
  await Effect.runPromise(
    maintainClients("repair", { terminal: true, host: "codex", flags: new Map(), registered }, f.ports),
  );
  expect(registered).not.toHaveBeenCalled();
  expect(f.ports.invoke).toHaveBeenNthCalledWith(1, "codex", expect.anything());
});
it("continues to the next registered host after an inspection failure", async () => {
  const f = fixture();
  const inspect = f.ports.inspect;
  const ports: MaintenancePorts = {
    ...f.ports,
    inspect: (fields) => (fields.host === "claude" ? Effect.fail(new Error("damaged profile")) : inspect(fields)),
  };
  await Effect.runPromise(
    maintainClients(
      "repair",
      { terminal: true, host: undefined, flags: new Map(), registered: () => ["claude", "codex"] },
      ports,
    ),
  );
  expect(f.failures).toHaveLength(1);
  expect(f.failures[0]?.host).toBe("claude");
  expect(f.output.join("")).toContain("codex: restored.");
});
