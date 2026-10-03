export const nativeRunFixtures = Object.freeze([
  "native-run-scenario.bend",
  "native-run-credential-restore.bend",
  "native-run-credential-rotate.bend",
  "native-run-boundaries.bend",
  "native-run-future-profile.bend",
  "native-run-wrong-completion.bend",
  "native-run-empty-sizes.bend",
].map(name => new URL(name, import.meta.url)));
