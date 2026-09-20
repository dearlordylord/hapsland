import { LocalId, ImportedShape as RenamedShape, Merged } from "./types";
import * as Types from "./types";
import { PublicShape } from "./reexports";
import { ExternalThing } from "external-types";

export interface Order {
  id: LocalId;
  shape?: RenamedShape;
  user: Types.UserId;
  exported: PublicShape;
  merged: Merged;
  external: ExternalThing;
  missing: MissingShape;
}

export type OrderPayload = {
  order: Order;
  local?: LocalId;
};
