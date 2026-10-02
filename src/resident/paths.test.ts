import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareResidentDirectory, residentPaths, verifyRemovableSocket } from "./paths.ts";

const directory = Effect.fn("ResidentEndpointFixture.directory")(function* () {
  const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), "hapsland-endpoint-")));
  yield* Effect.addFinalizer(() => Effect.promise(() => rm(root, { recursive: true, force: true })));
  return root;
});

it.effect("allows an absent socket pathname after private directory preparation", () => Effect.scoped(Effect.gen(function* () {
  const paths = residentPaths(yield* directory());
  yield* prepareResidentDirectory(paths);
  yield* verifyRemovableSocket(paths);
})));

for (const kind of ["regular", "dangling-symlink"] as const) {
  it.effect(`refuses to remove a ${kind} pathname`, () => Effect.scoped(Effect.gen(function* () {
    const paths = residentPaths(yield* directory());
    if (kind === "regular") yield* Effect.promise(() => writeFile(paths.socket, "retained fixture", { mode: 0o600 }));
    else yield* Effect.promise(() => symlink(join(paths.directory, "missing-target"), paths.socket));
    const failure = yield* verifyRemovableSocket(paths).pipe(Effect.flip);
    expect(failure).toMatchObject({ _tag: "ResidentEndpointError", operation: "verifyRemovableSocket",
      message: "resident socket pathname is unsafe" });
  })));
}

it.effect("preserves metadata errors other than an absent endpoint", () => Effect.scoped(Effect.gen(function* () {
  const root = yield* directory();
  const parent = join(root, "regular-parent");
  yield* Effect.promise(() => writeFile(parent, "fixture", { mode: 0o600 }));
  const failure = yield* verifyRemovableSocket(residentPaths(parent)).pipe(Effect.flip);
  expect(failure).toMatchObject({ _tag: "ResidentEndpointError", operation: "inspectEndpoint", code: "ENOTDIR" });
  expect(failure.message).not.toContain(root);
})));
