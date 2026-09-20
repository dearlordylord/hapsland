import * as Schema from "effect/Schema";
import {
  Struct as NamedStruct,
  String as NamedString,
  declare as declareSchema,
} from "effect/Schema";
import { reexportedStruct, reexportedString } from "./effect-reexports.ts";
import { wrap } from "./effect-helpers.ts";
import { writeFileSync } from "node:fs";

const ordinaryFactory = (value: unknown) => value;

export const Address = NamedStruct({
  street: NamedString,
});

export const Composed = Schema.Struct({ address: Address });

export const Namespaced = Schema.Array(Address);

export const ReExported = reexportedStruct({ value: reexportedString });

export const Optional = Schema.Struct({ name: Schema.optional(Schema.String) });

export const Transformed = Schema.decodeTo(Schema.String)(Schema.String);

export const Declared = declareSchema(
  (value: unknown): value is string => typeof value === "string",
);

export const Wrapped = wrap(Composed);

// Similar-looking ordinary values are deliberately not schema roots.
export const Ordinary = { Struct: () => "ordinary", String: () => "ordinary" };
export const OrdinaryNamespace = { Array: () => [], optional: (value: unknown) => value };
export const OrdinaryCall = ordinaryFactory({ field: "ordinary" });

writeFileSync(
  new URL("../.module-init.marker", import.meta.url),
  process.env.DECLARATION_EXTRACTION_MARKER_TOKEN ?? "evaluated",
);
