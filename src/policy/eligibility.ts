import { extname } from "node:path";

const allowedExtensions = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".json",
  ".kt",
  ".md",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".sh",
  ".sql",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const excludedSegments = new Set([
  ".git",
  ".idea",
  ".vscode",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "target",
  "vendor",
]);

const sensitiveNames = /(^|\/)(\.env(?:\..*)?|.*\.(?:key|pem|p12|pfx)|credentials(?:\..*)?|secrets?(?:\..*)?)$/i;
const generatedNames = /(?:^|\/)(?:package-lock\.json|bun\.lock|yarn\.lock|pnpm-lock\.yaml)$/i;

export const ineligibleReason = (path: string): string | undefined => {
  const portable = path.replaceAll("\\", "/");
  if (sensitiveNames.test(portable)) return "sensitive path excluded";
  if (generatedNames.test(portable)) return "generated or lock file excluded";
  if (portable.split("/").some((segment) => excludedSegments.has(segment))) {
    return "generated, build, or vendored path excluded";
  }
  if (!allowedExtensions.has(extname(portable).toLowerCase())) {
    return "file extension is not configured for review";
  }
  return undefined;
};
