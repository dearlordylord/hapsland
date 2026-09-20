import type { MissingImported } from "./does-not-exist.ts";

export interface UnresolvedRoot {
  missing: MissingImported;
  label: string;
}
