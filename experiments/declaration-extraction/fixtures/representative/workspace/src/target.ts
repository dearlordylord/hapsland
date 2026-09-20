import { LocalId, ImportedShape as RenamedShape, Merged } from "./types";
import * as Types from "./types";
import { PublicShape } from "./reexports";
import { ExternalThing } from "external-types";
import { ScopedThing } from "@scope/external-types";

export interface Order {
  id: LocalId;
  shape: RenamedShape;
  user: Types.UserId;
  exported: PublicShape;
  merged: Merged;
  external: ExternalThing;
  scoped: ScopedThing;
  missing: MissingShape;
}

export type OrderPayload = {
  order: Order;
  local: LocalId;
};

// This top-level initializer is deliberately in the edited module's import
// graph. The extractor must read source without importing/evaluating it.
import { writeFileSync } from "node:fs";
writeFileSync(new URL("../.module-init.marker", import.meta.url), "evaluated");
