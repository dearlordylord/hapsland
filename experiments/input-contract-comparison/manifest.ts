import { inputComparisonFixtures } from "./fixtures.ts";

/**
 * The checked-in manifest is deliberately source-bearing: authors review the
 * fixture and rationale together before any credential-gated run.  Renderers
 * consume this immutable list and add no labels from backend output.
 */
export const preRegisteredFixtureManifest = inputComparisonFixtures.map((fixture) => ({
  id: fixture.id,
  name: fixture.name,
  category: fixture.category,
  path: fixture.path,
  domain: fixture.domain,
  contentHash: fixture.contentHash,
  fixtureDigest: fixture.fixtureDigest,
  rootName: fixture.rootName,
  rootKind: fixture.rootKind,
  contextRequired: fixture.contextRequired === true,
  diffSufficient: fixture.diffSufficient === true,
  wholeFileDilution: fixture.wholeFileDilution === true,
  negativeControl: fixture.negativeControl === true,
  requiredReferences: [...fixture.evidence.requiredReferences],
  expectations: fixture.expectations,
}));

export type PreRegisteredFixture = (typeof preRegisteredFixtureManifest)[number];
