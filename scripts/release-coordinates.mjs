const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const candidate = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*$/;

export const validateReleaseCoordinates = (pin) => {
  if (pin === null || typeof pin !== "object" || pin.packageName !== "@hapsland/hapsland" ||
      !((pin.tag === "latest" && stable.test(pin.version)) || (pin.tag === "next" && candidate.test(pin.version))) ||
      typeof pin.repositoryUrl !== "string" ||
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(pin.repositoryUrl) ||
      !/^[0-9a-f]{40}$/.test(pin.sourceCommit ?? "") || !/^[0-9a-f]{64}$/.test(pin.archiveSha256 ?? "")) {
    throw new Error("release pin must declare reviewed coordinates: stable version/latest or prerelease version/next, canonical repository, commit, and SHA-256");
  }
  return { ...pin, archiveFilename: `hapsland-hapsland-${pin.version}.tgz` };
};
