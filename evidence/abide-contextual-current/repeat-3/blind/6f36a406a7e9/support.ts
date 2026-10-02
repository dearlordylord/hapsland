export interface BuildArtifact { provenance: BuildProvenance; }
export interface BuildProvenance { source: SourceRevision; }
export interface SourceRevision { commit: "a1" | "b2"; repository: "core" | "web"; }
