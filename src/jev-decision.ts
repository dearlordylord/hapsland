import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { Decision, DecisionModel } from "effect/unstable/ai";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { JEV_API_BASE } from "./runtime/backend.ts";

export const MODEL = "jev-latest";

export type ProbabilityInstructions = {
  readonly question: string;
  readonly focus: string;
};

export type ProbabilityCriterion = {
  readonly what: string;
  readonly examples: ReadonlyArray<string>;
};

export type ProbabilityCriteria = {
  readonly false: ProbabilityCriterion;
  readonly true: ProbabilityCriterion;
};

const renderInstructions = ({ question, focus }: ProbabilityInstructions): string =>
  `${question}\n\nFocus: ${focus}`;

const renderCriterion = ({ what, examples }: ProbabilityCriterion): string =>
  `${what}\n\nExamples:\n${examples.map((example) => `- ${example}`).join("\n")}`;

/**
 * Preserves the prototype's structured Noul wording while adapting it to the
 * provider-neutral string contract accepted by Effect's Decision API.
 */
export const probability = (
  instructions: ProbabilityInstructions,
  criteria: ProbabilityCriteria,
): Decision.Probability =>
  Decision.probability({
    instructions: renderInstructions(instructions),
    criteria: {
      false: renderCriterion(criteria.false),
      true: renderCriterion(criteria.true),
    },
  });

type ProbabilityDecisions = Readonly<Record<string, Decision.Probability>>;

/** Validate an unknown script fixture as JSON, then issue all decisions in one request. */
export const decide = <const Decisions extends ProbabilityDecisions>(options: {
  readonly state: unknown;
  readonly decisions: Decisions;
}) =>
  Effect.gen(function* () {
    const input = yield* Schema.decodeUnknownEffect(Schema.Json)(options.state);
    const definition = Decision.make({ input: Schema.Json, decisions: options.decisions });
    return yield* DecisionModel.decide(definition, { input });
  });

/**
 * Builds the Jev-backed DecisionModel for one explicit destination and credential
 * environment variable. The destination is part of consent identity; it is not
 * silently replaced by a provider default after dispatch authorization.
 */
export const liveLayer = (options: {
  readonly apiUrl: string;
  readonly credentialEnvVar: string;
}) => {
  const client = Layer.effect(
    TypeSafeClient.TypeSafeClient,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted(options.credentialEnvVar);
      return yield* TypeSafeClient.make({ apiKey, apiUrl: options.apiUrl });
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
  return TypeSafeDecisionModel.model(MODEL).pipe(Layer.provide(client));
};

/** Reads TYPESAFE_API_KEY and uses the TypeSafe service's default destination. */
export const Live = liveLayer({
  apiUrl: JEV_API_BASE,
  credentialEnvVar: "TYPESAFE_API_KEY",
});
