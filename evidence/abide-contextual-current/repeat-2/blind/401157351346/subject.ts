import type { StoredBlock } from "./support";
export interface CaseState { displayLabel: string; block: StoredBlock; /** Requested compression for a future repack; may differ from the stored block. */ compression: "none" | "zstd"; }
