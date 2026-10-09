// Generated from the release and role package manifests; do not edit.
export const BUN_VERSION = "1.3.14" as const
export const RELEASE_VERSION = "0.1.2" as const
export const RELEASE_NAME = "@hapsland/hapsland" as const
export const SOURCE_ENTRIES = {
  "cli": "packages/cli-entry/src/cli.ts",
  "doctor": "packages/doctor-entry/src/package-doctor.ts",
  "hook": "packages/hook-entry/src/hook-main.ts",
  "parser": "packages/parser-entry/src/parser-main.ts",
  "resident": "packages/resident-entry/src/resident/main.ts"
} as const
export const EMITTED_ENTRIES = {
  "cli": "packages/cli-entry/dist/cli.js",
  "doctor": "packages/doctor-entry/dist/package-doctor.js",
  "hook": "packages/hook-entry/dist/hook-main.js",
  "parser": "packages/parser-entry/dist/parser-main.js",
  "resident": "packages/resident-entry/dist/resident/main.js"
} as const
export const RELEASE_COMMAND_NAMES = {
  "cli": "hapsland",
  "doctor": "hapsland-doctor",
  "hook": "hapsland-hook",
  "parser": "hapsland-parser",
  "resident": "hapsland-resident"
} as const
