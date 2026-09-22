export const requireCleanInstallationPreview = (preview) => {
  if (preview?.status !== "preview" || typeof preview.proposal?.digest !== "string") {
    throw new Error("installed CLI did not produce a complete installation preview");
  }
  if (preview.installed !== false) {
    throw new Error("live milestone requires a clean Codex home without a pre-existing owned installation");
  }
  return preview.proposal.digest;
};

export const requireCreatedInstallation = (result) => {
  if (result?.status !== "installed") {
    throw new Error("live milestone did not create a new scoped installation");
  }
};
