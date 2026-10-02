import { Effect, ManagedRuntime } from "effect";
import { ResidentStartup, residentStartupLayer } from "../resident/client.ts";

/** Native fixture process boundary; all calls share its startup service lifetime. */
const runtime = ManagedRuntime.make(residentStartupLayer);
process.once("beforeExit", () => { void runtime.dispose(); });
export const runClient = <A, E>(effect: Effect.Effect<A, E, ResidentStartup>): Promise<A> =>
  runtime.runPromise(effect);
