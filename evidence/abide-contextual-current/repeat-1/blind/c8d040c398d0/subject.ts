import type { BuildArtifact } from "./support";
export type CaseState = {
  [Commit in BuildArtifact["provenance"]["source"]["commit"]]: {
    displayLabel: string;
    artifact: BuildArtifact & {
      provenance: { source: { commit: Commit } };
    };
    commit: Commit;
  }
}[BuildArtifact["provenance"]["source"]["commit"]];
