const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const candidate = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*$/

export const validateReleaseTarget = (pin) => {
  if (
    pin === null ||
    typeof pin !== "object" ||
    pin.packageName !== "@hapsland/hapsland" ||
    !((pin.tag === "latest" && stable.test(pin.version)) || (pin.tag === "next" && candidate.test(pin.version))) ||
    typeof pin.repositoryUrl !== "string" ||
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(pin.repositoryUrl)
  ) {
    throw new Error(
      "release pin must declare reviewed coordinates: stable version/latest or prerelease version/next and canonical repository"
    )
  }
  return { ...pin, archiveFilename: `hapsland-hapsland-${pin.version}.tgz` }
}

export const validateReleaseCoordinates = (pin) => {
  const target = validateReleaseTarget(pin)
  if (
    pin.format !== 1 ||
    !/^[0-9a-f]{40}$/.test(pin.sourceCommit ?? "") ||
    !/^[0-9a-f]{64}$/.test(pin.archiveSha256 ?? "") ||
    !/^[0-9a-f]{64}$/.test(pin.sourceTreeSha256 ?? "") ||
    !/^[0-9a-f]{64}$/.test(pin.auditSha256 ?? "") ||
    !["linux-arm64", "darwin-arm64"].includes(pin.buildPlatform)
  )
    throw new Error(
      "Release candidate is not prepared and audited. Run npm run release:prepare, then commit and push its pin."
    )
  return target
}
