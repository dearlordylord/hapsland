export interface StoredBlock { wire: WireRepresentation; }
export interface WireRepresentation { compression: "none" | "zstd"; generation: 1 | 2; }
