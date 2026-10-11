import { Schema } from "effect"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isCodexHostVersion } from "@hapsland/native-observation/direct-event/codex-version"

export class TargetPackageMetadataInvalid extends Error {}

const PackageManifest = Schema.Struct({ version: Schema.NonEmptyString })

const PackageRuntimeDeclaration = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  runtime: Schema.Struct({ name: Schema.Literals(["bun", "node"]), version: Schema.String }),
  profiles: Schema.NonEmptyArray(Schema.Unknown),
  residentProtocol: Schema.Literal(1),
  codex: Schema.optional(Schema.Unknown)
})

const RuntimeProfile = Schema.Struct({ operatingSystem: Schema.String, architecture: Schema.String })

const DeclaredCodex = Schema.Struct({ testedVersions: Schema.NonEmptyArray(Schema.String) })

const packageVersionAt = (root: string) => {
  const manifest: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  try {
    return Schema.decodeUnknownSync(PackageManifest)(manifest).version
  } catch {
    throw new Error("package.json must declare a nonempty version")
  }
}

const packageRuntimeAt = (root: string) => {
  const declaration: unknown = JSON.parse(readFileSync(join(root, "package-runtime.json"), "utf8"))
  try {
    return Schema.decodeUnknownSync(PackageRuntimeDeclaration)(declaration)
  } catch {
    throw new Error("package-runtime.json must declare the embedded runtime, nonempty profiles, and residentProtocol 1")
  }
}

const decodeRuntimeProfile = (profile: unknown) => {
  try {
    return Schema.decodeUnknownSync(RuntimeProfile)(profile)
  } catch {
    throw new Error("package-runtime.json contains an invalid runtime profile")
  }
}

const declaredCodexVersions = (codex: unknown): ReadonlyArray<string> => {
  if (codex === undefined) return ["0.155.1"]
  try {
    const { testedVersions } = Schema.decodeUnknownSync(DeclaredCodex)(codex)
    if (!testedVersions.every(isCodexHostVersion)) throw new Error("unsupported")
    return testedVersions
  } catch {
    throw new Error("package-runtime.json declares unsupported Codex versions")
  }
}

interface PackageMetadata {
  packageVersion: string
  residentProtocol: number
  runtimeVersion: string
  codexVersions: ReadonlyArray<string>
  runtimeProfiles: ReadonlyArray<{ readonly operatingSystem: string; readonly architecture: string }>
  packageMetadata: { readonly ready: true } | { readonly ready: false; readonly reason: string }
}

export const readPackageMetadata = (root: string): PackageMetadata => {
  const metadata: PackageMetadata = {
    packageVersion: "development",
    residentProtocol: 1,
    runtimeVersion: "unsupported",
    codexVersions: ["0.155.1"],
    runtimeProfiles: [],
    packageMetadata: { ready: true }
  }
  try {
    metadata.packageVersion = packageVersionAt(root)
    const declaration = packageRuntimeAt(root)
    const profiles = declaration.profiles.map(decodeRuntimeProfile)
    metadata.residentProtocol = declaration.residentProtocol
    metadata.runtimeVersion = declaration.runtime.version
    metadata.codexVersions = declaredCodexVersions(declaration.codex)
    metadata.runtimeProfiles = profiles
  } catch (cause) {
    metadata.packageMetadata = {
      ready: false,
      reason: cause instanceof Error ? cause.message : "package metadata is unreadable"
    }
  }
  return metadata
}
