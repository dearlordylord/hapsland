import type { BuildArtifact } from "./support";

type SourceCommit = BuildArtifact["provenance"]["source"]["commit"];
type ArtifactForCommit<C extends SourceCommit> = Omit<BuildArtifact, "provenance"> & {
  provenance: Omit<BuildArtifact["provenance"], "source"> & {
    source: Omit<BuildArtifact["provenance"]["source"], "commit"> & { commit: C };
  };
};

export type CaseState = {
  [C in SourceCommit]: {
    displayLabel: string;
    artifact: ArtifactForCommit<C>;
    commit: C;
  };
}[SourceCommit];
