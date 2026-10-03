import { Schema } from "effect";
import { decoder, PositiveNat } from "../../../src/canonical/boundary-schema.ts";

const Profile = Schema.Struct({ capacity: PositiveNat, lifetimeMs: PositiveNat });
/** Capture the existing optional configuration, including its declared default. */
export const encodeCollectorProfile = (profile: { readonly capacity: number; readonly lifetimeMs?: number } | undefined) => {
  if (profile === undefined) return { $: "None" };
  const checked = decoder(Profile)({ capacity: profile.capacity, lifetimeMs: profile.lifetimeMs ?? 30000 });
  return { $: "Some", value: { $: "CollectorScenario.Profile", capacity: checked.capacity, lifetime: checked.lifetimeMs } };
};
