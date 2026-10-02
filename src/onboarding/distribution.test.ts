import * as Effect from "effect/Effect";
import { Deferred, Fiber } from "effect";
import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stageRelease } from "./distribution.ts";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const fixture = (version: string) => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-distribution-")); roots.push(directory);
  const calls: Array<{ command: string; args: ReadonlyArray<string> }> = [];
  const run = (command: string, args: ReadonlyArray<string>) => Effect.try({ try: () => {
    calls.push({ command, args });
    if (args[0] === "view") return JSON.stringify(version);
    if (args[0] === "install") {
      const prefix = args[args.indexOf("--prefix") + 1];
      if (prefix === undefined) throw new Error("missing prefix");
      const packageRoot = join(prefix, "lib", "node_modules", "@hapsland", "hapsland");
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@hapsland/hapsland", version }));
    }
    return "";
  }, catch: (cause) => cause });
  return { directory, calls, run };
};
it("resolves next once, reuses the verified immutable release and retains identity", async () => {
  const test = fixture("0.2.0-next.3");
  const first = await Effect.runPromise(stageRelease({ kind: "registry", channel: "next" }, test));
  const second = await Effect.runPromise(stageRelease({ kind: "registry", channel: "next" }, test));
  expect(second.prefix).toBe(first.prefix);
  expect(test.calls.filter(call => call.args[0] === "install")).toHaveLength(1);
  const install = test.calls.find(call => call.args[0] === "install");
  expect(install?.args).toContain("@hapsland/hapsland@0.2.0-next.3");
  expect(install?.args).toContain("--ignore-scripts=true");
  expect(install?.args).toContain("--include=optional");
  expect(JSON.parse(readFileSync(join(first.prefix, "snapshot.json"), "utf8"))).toMatchObject({ version: 1, packageVersion: "0.2.0-next.3", source: { version: "0.2.0-next.3", channel: "next" } });
});
it("rejects a prerelease through stable before installation", async () => {
  const test = fixture("0.2.0-next.3");
  await expect(Effect.runPromise(stageRelease({ kind: "registry", channel: "latest" }, test))).rejects.toThrow("stable selection");
  expect(test.calls).toHaveLength(1);
});
it("hashes local archives without registry lookup", async () => {
  const test = fixture("0.1.0");
  const archive = join(test.directory, "candidate.tgz"); writeFileSync(archive, "local snapshot");
  const result = await Effect.runPromise(stageRelease({ kind: "archive", path: archive }, test));
  expect(result.identity).toMatchObject({ archive, archiveSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(test.calls.some(call => call.args[0] === "view")).toBe(false);
});
it("fails a mismatched installed artifact and never calls host registration", async () => {
  const test = fixture("0.1.0");
  const run = (command: string, args: ReadonlyArray<string>) => args[0] === "view" ? Effect.succeed(JSON.stringify("0.2.0")) : test.run(command, args);
  await expect(Effect.runPromise(stageRelease({ kind: "registry", channel: "latest" }, { directory: test.directory, run }))).rejects.toThrow("differs");
  expect(test.calls.some(call => call.command.endsWith("hapsland-doctor"))).toBe(false);
});
it("rejects stable versions through next before installation", async () => {
  const test = fixture("0.2.0");
  await expect(Effect.runPromise(stageRelease({ kind: "registry", channel: "next" }, test))).rejects.toThrow("candidate selection");
  expect(test.calls).toHaveLength(1);
});
it("rejects a registry response that disagrees with an explicit version", async () => {
  const test = fixture("0.2.0");
  await expect(Effect.runPromise(stageRelease({ kind: "registry", channel: "latest", version: "0.1.0" }, test))).rejects.toThrow("explicit selection");
  expect(test.calls).toHaveLength(1);
});

it("interrupting cached verification preserves the cache and does not start another installation", async () => {
  const test = fixture("0.1.0");
  await Effect.runPromise(stageRelease({ kind: "registry", channel: "latest" }, test));
  const before = readdirSync(test.directory).sort();
  await Effect.runPromise(Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    const run = (command: string, args: ReadonlyArray<string>) => command.endsWith("hapsland-doctor")
      ? Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never))
      : test.run(command, args);
    const staging = yield* Effect.forkChild(stageRelease({ kind: "registry", channel: "latest" }, {
      directory: test.directory, run,
    }), { startImmediately: true });
    yield* Deferred.await(started);
    yield* Fiber.interrupt(staging);
    expect((yield* Fiber.await(staging))._tag).toBe("Failure");
  }));
  expect(readdirSync(test.directory).sort()).toEqual(before);
  expect(test.calls.filter(call => call.args[0] === "install")).toHaveLength(1);
});
