import type { LocalId, ImportedShape as RenamedShape, MappedShape, Merged } from "@fixture/types";
import type * as Types from "./types.ts";
import type { PublicShape } from "./reexports.ts";
import type { ExternalThing } from "external-types";
import type { ScopedThing } from "@scope/external-types";

export interface Order {
  id: LocalId;
  shape?: RenamedShape;
  mapped: MappedShape;
  user: Types.UserId;
  exported: PublicShape;
  merged: Merged;
  external: ExternalThing;
  scoped: ScopedThing;
  missing: MissingShape;
}

export type OrderPayload = {
  order: Order;
  local?: LocalId;
};

// This top-level initializer is deliberately in the edited module's import
// graph. The extractor must read source without importing/evaluating it.
import { writeFileSync } from "node:fs";
writeFileSync(
  new URL("../.module-init.marker", import.meta.url),
  process.env.DECLARATION_EXTRACTION_MARKER_TOKEN ?? "evaluated",
);
