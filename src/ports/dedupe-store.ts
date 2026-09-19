import { mkdir, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface Interface {
  readonly claim: (fingerprint: string) => Effect.Effect<boolean>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@review/DedupeStore",
) {}

const directory = join(
  tmpdir(),
  `realtime-review-tool-v1-${typeof process.getuid === "function" ? process.getuid() : "user"}`,
);

export const layer = Layer.succeed(
  Service,
  Service.of({
    claim: Effect.fn("DedupeStore.claim")(function* (fingerprint) {
      return yield* Effect.tryPromise({
        try: async () => {
          await mkdir(directory, { recursive: true, mode: 0o700 });
          try {
            const handle = await open(join(directory, fingerprint), "wx", 0o600);
            await handle.close();
            return true;
          } catch (cause) {
            if (
              typeof cause === "object" &&
              cause !== null &&
              "code" in cause &&
              cause.code === "EEXIST"
            ) {
              return false;
            }
            throw cause;
          }
        },
        catch: () => undefined,
      }).pipe(Effect.catch(() => Effect.succeed(true)));
    }),
  }),
);

/** Unit tests that do not exercise process-level idempotency use an isolated no-op store. */
export const testLayer = Layer.succeed(
  Service,
  Service.of({ claim: () => Effect.succeed(true) }),
);

export * as DedupeStore from "./dedupe-store.ts";
