import { z } from "zod";
import * as Schema from "effect/Schema";

export const EffectContext = Schema.String;
export const CrossRoot = z.object({ nested: EffectContext, label: z.string() });
