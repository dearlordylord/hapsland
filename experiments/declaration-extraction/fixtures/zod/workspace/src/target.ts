import { z as namedZ } from "zod";
import * as Z from "zod";
import { reexportedZ } from "./zod-reexports.ts";
import { wrap } from "./zod-helpers.ts";
import { writeFileSync } from "node:fs";

const ordinaryFactory = (value: unknown) => value;

export const Address = namedZ.object({
  street: namedZ.string(),
});

export const Composed = Z.object({ address: Address, label: namedZ.string() });

export const NamedAlias = namedZ.string().optional();

export const ReExported = reexportedZ.array(Address);

export const Transformed = namedZ
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length > 0);

export const Wrapped = wrap(Composed);

// Framework-owned APIs that return errors/configuration, not schemas.
export const Treeified = Z.treeifyError({ issues: [] } as never);
export const Locales = Z.locales;
export const MissingConstructor = globalThis.missingZodFactory?.(Composed);

// Similar-looking ordinary values are deliberately not schema roots.
export const Ordinary = { object: () => "ordinary", parse: (value: unknown) => value };
export const OrdinaryNamespace = { string: () => "ordinary", array: () => [] };
export const OrdinaryCall = ordinaryFactory({ field: "ordinary" });

writeFileSync(
  new URL("../.module-init.marker", import.meta.url),
  process.env.DECLARATION_EXTRACTION_MARKER_TOKEN ?? "evaluated",
);
