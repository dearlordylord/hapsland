import * as Effect from "effect/Effect";
import { expect, it, vi } from "vitest";
import { updateClients, type UpdateOptions, type UpdatePorts } from "./update.ts";
import { profileFields, type invokeLifecycle } from "./client-lifecycle.ts";
import type { SetupClient } from "./client-selection.ts";

type Result = Effect.Success<ReturnType<typeof invokeLifecycle>>;
const digest = "a".repeat(64);
const preview: Result = { status: "preview", proposal: { digest, changes: ["owned hook"] } };
const fixture = (
  settings: {
    hosts?: SetupClient[];
    discoveryFailure?: boolean;
    responses?: Partial<Record<SetupClient, Effect.Effect<Result, unknown>[]>>;
    confirmation?: Effect.Effect<boolean, unknown>;
    activation?: Effect.Effect<void, unknown>;
    target?: Effect.Effect<string, unknown>;
  } = {},
) => {
  const output: string[] = [];
  const failures: Array<{ host: SetupClient; cause: unknown }> = [];
  const activations: string[] = [];
  const targetRuns: string[] = [];
  const responses = {
    claude: [...(settings.responses?.claude ?? [Effect.succeed(preview), Effect.succeed({ status: "updated" })])],
    codex: [...(settings.responses?.codex ?? [Effect.succeed(preview), Effect.succeed({ status: "complete" })])],
  };
  const options: UpdateOptions = {
    terminal: true,
    host: undefined,
    flags: new Map(),
    environment: {
      PATH: "/bin",
      TYPESAFE_API_KEY: "private-test-key",
      REVIEW_INSTALL_RUNTIME: "old-runtime",
      REVIEW_INSTALL_ENTRYPOINT: "old-entry",
    },
  };
  const ports: UpdatePorts = {
    fields: (host) => profileFields(host, new Map([[`--${host}-home`, `/profiles/${host}`]])),
    registered: vi.fn<UpdatePorts["registered"]>((_flags, reportFailure) => {
      if (settings.discoveryFailure) reportFailure("claude", new Error("registration unreadable"));
      return settings.hosts ?? ["claude", "codex"];
    }),
    target: Effect.sync(() => {
      targetRuns.push("target");
    }).pipe(Effect.andThen(settings.target ?? Effect.succeed("/verified/hapsland"))),
    invoke: vi.fn<UpdatePorts["invoke"]>(
      (_executable, host) => responses[host].shift() ?? Effect.fail(new Error("unexpected invocation")),
    ),
    activate: (executable) =>
      Effect.sync(() => {
        activations.push(executable);
      }).pipe(Effect.andThen(settings.activation ?? Effect.void)),
    confirm: vi.fn(() => settings.confirmation ?? Effect.succeed(true)),
    write: (text) => output.push(text),
    reportFailure: (host, cause) => failures.push({ host, cause }),
  };
  return { options, ports, output, failures, activations, targetRuns };
};

it("previews both clients before one approval and applies their respective frozen digests", async () => {
  const f = fixture();
  await Effect.runPromise(updateClients(f.options, f.ports));
  expect(f.ports.invoke).toHaveBeenCalledTimes(4);
  const calls = vi.mocked(f.ports.invoke).mock.calls;
  expect(calls.map((call) => `${call[1]}:${call[2].operation}`)).toEqual([
    "claude:update-preview",
    "codex:update-preview",
    "claude:update",
    "codex:update",
  ]);
  expect(calls[2]?.[2]).toMatchObject({ version: 1, host: "claude", proposalDigest: digest });
  expect(calls[3]?.[2]).toMatchObject({ version: 1, host: "codex", proposalDigest: digest });
  expect(calls[0]?.[3]).toEqual({ PATH: "/bin", TYPESAFE_API_KEY: "private-test-key" });
  expect(f.options.environment.REVIEW_INSTALL_RUNTIME).toBe("old-runtime");
  expect(f.ports.confirm).toHaveBeenCalledOnce();
  expect(f.activations).toEqual(["/verified/hapsland", "/verified/hapsland"]);
  expect(f.failures).toEqual([]);
  expect(f.output.join("")).toContain("claude: updated.");
  expect(f.output.join("")).not.toContain("private-test-key");
});

it("updates an explicitly selected client without registration discovery", async () => {
  const f = fixture();
  await Effect.runPromise(updateClients({ ...f.options, host: "codex" }, f.ports));
  expect(f.ports.registered).not.toHaveBeenCalled();
  expect(vi.mocked(f.ports.invoke).mock.calls.map((call) => call[1])).toEqual(["codex", "codex"]);
});

it.each([false, true])(
  "does not stage a target when registration discovery finds no clients (failure=%s)",
  async (discoveryFailure) => {
    const f = fixture({ hosts: [], discoveryFailure });
    await Effect.runPromise(updateClients(f.options, f.ports));
    expect(f.targetRuns).toEqual([]);
    expect(f.ports.invoke).not.toHaveBeenCalled();
    expect(f.ports.confirm).not.toHaveBeenCalled();
    expect(f.output.join("")).toContain(
      discoveryFailure ? "Resolve the reported discovery errors" : "Run hapsland setup first",
    );
    expect(f.failures).toHaveLength(discoveryFailure ? 1 : 0);
  },
);

it("requires a terminal before discovering registrations", async () => {
  const f = fixture();
  await expect(Effect.runPromise(updateClients({ ...f.options, terminal: false }, f.ports))).rejects.toThrow(
    "needs a terminal",
  );
  expect(f.ports.registered).not.toHaveBeenCalled();
  expect(f.targetRuns).toEqual([]);
});

it.each([
  { status: "preview", alreadyCurrent: true, proposal: { digest, changes: ["owned hook"] } },
  { status: "preview", proposal: { digest, changes: [] } },
] satisfies Result[])("activates an already-current target without approval or apply (%j)", async (result) => {
  const f = fixture({ hosts: ["claude"], responses: { claude: [Effect.succeed(result)] } });
  await Effect.runPromise(updateClients(f.options, f.ports));
  expect(f.ports.invoke).toHaveBeenCalledOnce();
  expect(f.ports.confirm).not.toHaveBeenCalled();
  expect(f.activations).toHaveLength(1);
  expect(f.output.join("")).toContain("claude: already current.");
});

it.each([
  Effect.fail(new Error("preview unavailable")),
  Effect.succeed<Result>({ status: "conflict", proposal: { digest, changes: [] } }),
  Effect.succeed<Result>({ status: "preview" }),
])("reports a rejected preview and still updates the other client", async (response) => {
  const f = fixture({ responses: { claude: [response] } });
  await Effect.runPromise(updateClients(f.options, f.ports));
  expect(f.failures.map((item) => item.host)).toEqual(["claude"]);
  expect(f.output.join("")).toContain("claude: failed.");
  expect(f.output.join("")).toContain("codex: updated.");
});

it("cancels every proposed update after a declined approval", async () => {
  const f = fixture({ confirmation: Effect.succeed(false) });
  await Effect.runPromise(updateClients(f.options, f.ports));
  expect(f.ports.invoke).toHaveBeenCalledTimes(2);
  expect(f.activations).toEqual([]);
  expect(f.output.join("")).toContain("claude: skipped.");
  expect(f.output.join("")).toContain("codex: skipped.");
});

it.each(["updated", "complete", "already-current", "partial", "conflict"])(
  "handles apply status %s with the correct activation and recovery outcome",
  async (status) => {
    const f = fixture({
      hosts: ["claude"],
      responses: { claude: [Effect.succeed(preview), Effect.succeed({ status })] },
    });
    await Effect.runPromise(updateClients(f.options, f.ports));
    expect(f.activations).toHaveLength(status === "conflict" ? 0 : 1);
    if (status === "partial") {
      expect(String(f.failures[0]?.cause)).toContain("hapsland repair claude");
      expect(f.output.join("")).toContain("claude: failed.");
    } else if (status === "conflict") expect(f.failures).toHaveLength(1);
    else
      expect(f.output.join("")).toContain(
        status === "already-current" ? "claude: already current." : "claude: updated.",
      );
  },
);

it("accepts a recoverable partial preview for approval", async () => {
  const f = fixture({
    hosts: ["claude"],
    responses: { claude: [Effect.succeed({ ...preview, status: "partial" }), Effect.succeed({ status: "updated" })] },
  });
  await Effect.runPromise(updateClients(f.options, f.ports));
  expect(f.ports.confirm).toHaveBeenCalledOnce();
  expect(f.failures).toEqual([]);
});

it("reports apply failure independently and continues the second approved client", async () => {
  const f = fixture({ responses: { claude: [Effect.succeed(preview), Effect.fail(new Error("apply unavailable"))] } });
  await Effect.runPromise(updateClients(f.options, f.ports));
  expect(f.failures.map((item) => item.host)).toEqual(["claude"]);
  expect(f.output.join("")).toContain("codex: updated.");
});

it.each(["current", "partial", "updated"])(
  "reports activation failure after %s without claiming success",
  async (stage) => {
    const failure = new Error("activation unavailable");
    const responses =
      stage === "current"
        ? [Effect.succeed<Result>({ ...preview, alreadyCurrent: true })]
        : [Effect.succeed(preview), Effect.succeed<Result>({ status: stage })];
    const f = fixture({ hosts: ["claude"], responses: { claude: responses }, activation: Effect.fail(failure) });
    await Effect.runPromise(updateClients(f.options, f.ports));
    expect(f.failures).toEqual([{ host: "claude", cause: failure }]);
    expect(f.output.join("")).toContain("claude: failed.");
  },
);

it.each(["target", "confirmation"])("stops before apply when %s fails", async (stage) => {
  const failure = new Error(`${stage} unavailable`);
  const f = fixture(stage === "target" ? { target: Effect.fail(failure) } : { confirmation: Effect.fail(failure) });
  await expect(Effect.runPromise(updateClients(f.options, f.ports))).rejects.toThrow(`${stage} unavailable`);
  expect(f.ports.invoke).toHaveBeenCalledTimes(stage === "target" ? 0 : 2);
  expect(f.activations).toEqual([]);
});
