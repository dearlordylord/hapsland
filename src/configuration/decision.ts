import { initialCanonical, stepCanonical, type CanonicalEvent } from "../canonical/adapter.ts";

// Stateless configuration checks share the installed Canonical.step boundary.
// A fresh empty lifetime keeps file settings independent of resident capacity.
const initial = initialCanonical({ globalItems: 1, globalBytes: 1, partitionItems: 1, partitionBytes: 1 });

const decide = (event: CanonicalEvent) => {
  const result = stepCanonical(initial, event);
  if (result.rejection !== undefined || result.commands.length !== 1) {
    throw new Error("canonical configuration decision refused");
  }
  return result.commands[0];
};

export const replaceIncludes = (supplied: boolean, currentRank: number, candidateRank: number): boolean => {
  const command = decide({ kind: "includeLayerCheck", supplied, currentRank, candidateRank });
  if (command?.kind !== "includeChoice") throw new Error("canonical include choice missing");
  return command.choice === "replaceIncludes";
};

export const selectFile = (facts: {
  readonly protected: boolean;
  readonly excluded: boolean;
  readonly includesEmpty: boolean;
  readonly included: boolean;
}): "protected" | "excluded" | "empty-includes" | "not-included" | "selected" => {
  const command = decide({ kind: "fileSelectionCheck", ...facts });
  if (command?.kind !== "fileSelection") throw new Error("canonical file selection missing");
  if (command.selection === "emptyIncludes") return "empty-includes";
  if (command.selection === "notIncluded") return "not-included";
  return command.selection;
};

export const classifyFileProtection = (facts: { readonly kind: "invalid" } | {
  readonly kind: "valid";
  readonly sensitiveName: boolean;
  readonly generatedName: boolean;
  readonly generatedSegment: boolean;
  readonly allowedExtension: boolean;
}): "allowedPath" | "repositoryBoundary" | "sensitivePath" | "generatedOrVendor" | "fileExtension" => {
  const command = decide(facts.kind === "invalid"
    ? { kind: "fileProtectionInvalid" }
    : { kind: "fileProtectionCheck", sensitiveName: facts.sensitiveName,
      generatedName: facts.generatedName, generatedSegment: facts.generatedSegment,
      allowedExtension: facts.allowedExtension });
  if (command?.kind !== "fileProtection") throw new Error("canonical file protection missing");
  return command.protection;
};

export const admitCandidateFile = (facts: {
  readonly gitAdmin: boolean;
  readonly physicalSafe: boolean;
  readonly gitAllowed: boolean;
}): "candidateAllowed" | "refuseGitAdmin" | "refuseFileKind" | "refuseGitIgnore" => {
  const command = decide({ kind: "candidateFileCheck", ...facts });
  if (command?.kind !== "candidateFile") throw new Error("canonical candidate file decision missing");
  return command.candidate;
};

export const admitReview = (facts: {
  readonly rootValid: boolean;
  readonly configurationValid: boolean;
  readonly credentialReady: boolean;
  readonly selected: boolean;
}): "admitReview" | "refuseRoot" | "refuseConfiguration" | "refuseCredential" | "refuseSelection" => {
  const command = decide({ kind: "reviewAdmissionCheck", ...facts });
  if (command?.kind !== "reviewAdmission") throw new Error("canonical review admission missing");
  return command.admission;
};
