import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Synthetic installation metadata for deterministic tests, not a release support declaration. */
export const installationPackageDeclaration = () => ({
  schemaVersion: 1,
  runtime: { name: "node", version: process.version.slice(1) },
  codex: { testedVersions: ["0.155.1", "0.156.0"] },
  profiles: [{ operatingSystem: process.platform, architecture: process.arch }],
  residentProtocol: 1,
});

/** Files are observed for installation readiness; these fixtures never execute hook review. */
export const createInstallationPackageFixture = (root: string) => {
  const packageRoot = join(root, "installation-package");
  const dist = join(packageRoot, "dist");
  const entrypoint = join(dist, "cli.js");
  if (existsSync(entrypoint)) return entrypoint;
  mkdirSync(join(dist, "resident"), { recursive: true });
  writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@hapsland/hapsland", version: "0.1.0", type: "module" }));
  writeFileSync(join(packageRoot, "package-runtime.json"), JSON.stringify(installationPackageDeclaration()));
  for (const path of [entrypoint, join(dist, "parser-main.js"), join(dist, "resident", "main.js")]) writeFileSync(path, "// deterministic installation fixture\n");
  return entrypoint;
};
