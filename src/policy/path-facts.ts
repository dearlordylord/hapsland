import { extname } from "node:path";
import { normalizeRepositoryPath } from "../matcher/glob.ts";

// Native name and extension observations. Bend selects the protection result.
const reviewableExtensions = new Set([
  ".c", ".cc", ".cpp", ".cs", ".css", ".cts", ".go", ".h", ".hpp", ".html", ".java",
  ".js", ".jsx", ".json", ".kt", ".md", ".php", ".py", ".rb", ".rs", ".scala",
  ".sh", ".sql", ".swift", ".toml", ".ts", ".tsx", ".mts", ".yaml", ".yml",
]);
const sensitiveNames = /(^|\/)(\.env(?:\..*)?|.*\.(?:key|pem|p12|pfx)|credentials(?:\..*)?|secrets?(?:\..*)?)$/i;
const generatedNames = /(?:^|\/)(?:package-lock\.json|bun\.lock|yarn\.lock|pnpm-lock\.yaml)$/i;
const generatedSegments = new Set([
  ".git", ".idea", ".vscode", "build", "coverage", "dist", "generated", "node_modules",
  "target", "vendor",
]);

export const pathFacts = (path: string) => {
  const normalized = normalizeRepositoryPath(path);
  if (normalized === undefined || normalized === ".") return { kind: "invalid" } as const;
  return {
    kind: "valid" as const,
    normalized,
    sensitiveName: sensitiveNames.test(normalized),
    generatedName: generatedNames.test(normalized),
    generatedSegment: normalized.split("/").some((segment) => generatedSegments.has(segment)),
    allowedExtension: reviewableExtensions.has(extname(normalized).toLowerCase()),
  };
};
