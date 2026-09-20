import * as Schema from "effect/Schema";
import {
  Fixture as SharedFixtureSchema,
  type Expectation as SharedExpectation,
  type Fixture as SharedFixture,
} from "../../src/evaluation/model.ts";
import { makeExpectation } from "../../src/evaluation/digest.ts";
import type { Fixture } from "./protocol.ts";

/**
 * Adapter at the experiment boundary.  The comparison-specific before/after and
 * extraction evidence remain local experiment data; fixture identity and authored
 * expectation records are validated through the shared evaluation model from #15.
 */
export const sharedFixtureRecord = (fixture: Fixture): SharedFixture =>
  Schema.decodeUnknownSync(SharedFixtureSchema)({
    id: fixture.id,
    name: fixture.name,
    role: fixture.negativeControl === true
      ? "negative-control"
      : fixture.expectations[0]?.kind === "violation" ? "positive" : fixture.expectations[0]?.kind === "clear" ? "negative" : "ambiguous",
    domain: fixture.domain,
    path: fixture.path,
    source: fixture.after,
    contentHash: fixture.contentHash,
    fixtureDigest: fixture.fixtureDigest,
  });

export const sharedExpectationRecord = (fixture: Fixture): SharedExpectation => {
  const authored = fixture.expectations[0];
  if (!authored) throw new Error(`fixture ${fixture.id} has no expectation`);
  const result = authored.kind === "clear" || authored.kind === "violation"
    ? {
        kind: authored.kind,
        band: {
          minimum: authored.band?.minimum ?? 0,
          maximum: authored.band?.maximum ?? 1,
          minimumInclusive: authored.band?.minimumInclusive ?? true,
          maximumInclusive: authored.band?.maximumInclusive ?? false,
        },
      }
    : { kind: authored.kind, reason: authored.rationale };
  return makeExpectation({
    fixtureId: fixture.id,
    ruleId: authored.ruleId,
    result,
    rationale: authored.rationale,
  });
};
