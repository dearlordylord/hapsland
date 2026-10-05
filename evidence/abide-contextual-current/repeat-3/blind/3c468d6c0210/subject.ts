import type { StoredBlock } from "./support";
export interface CaseState { displayLabel: string; block: StoredBlock; compression: "none" | "zstd"; }
