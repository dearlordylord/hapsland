import { E0, NOUL_KEYS, measured } from "../questions.ts";
import {
  DEFAULT_RULE_THRESHOLD,
  decodeRulePackDocument,
  type DecodedRulePack,
  type RuleDefinition,
} from "./schema.ts";
import { FUNCTION_CAPABILITIES, FUNCTION_INPUT_CONTRACT, TYPE_CAPABILITIES, TYPE_INPUT_CONTRACT } from "./targets.ts";

/** Stable content identity for the bundled Noul baseline. */
export const NOUL_PACK_ID = "noul" as const;
export const NOUL_PACK_VERSION = "1.0.0" as const;

const messages: Readonly<Record<string, string>> = {
  r1_inferred_case: "The type appears to encode distinct cases without naming the case.",
  r2_meaningless_combinations: "The type appears to admit field combinations with no domain meaning.",
  r3_split_correlations: "Parts of one fact appear independently settable.",
  r4_duplicate_encoding: "The type appears to store the same fact in places that can disagree.",
  r5_absence_confusion: "Absence appears to carry more than one meaning.",
  r6_bare_domain_value: "A domain value appears to use an overly broad primitive type.",
  r7_name_wider_than_type: "A field name promises constraints that its type does not enforce.",
  r8_name_claims_resource: "A declaration appears to hide a resource named by the operation.",
  r9_body_reaches_undeclared: "A callable appears to reach state or resources absent from its declaration.",
};

/** Built-in extra applicability remains a function of the source rung. */
export const isNoulRuleApplicable = (ruleId: string, source: string): boolean =>
  measured(ruleId, source);

const rules: ReadonlyArray<RuleDefinition> = NOUL_KEYS.map((id) => {
  const decision = E0[id];
  return {
    id,
    question: decision.instructions,
    criteria: decision.criteria,
    threshold: DEFAULT_RULE_THRESHOLD,
    message: messages[id] ?? `Review rule ${id} may apply.`,
    reviewTargets: [
      { artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT, capabilities: TYPE_CAPABILITIES },
      ...(id === "r9_body_reaches_undeclared" ? [{ artifactKind: "function" as const,
        inputContract: FUNCTION_INPUT_CONTRACT, capabilities: FUNCTION_CAPABILITIES }] : []),
    ],
  };
});

/** The bundled pack is decoded by the same boundary used for local packs. */
export const BUNDLED_NOUL_PACK: DecodedRulePack = decodeRulePackDocument(
  {
    schemaVersion: 1,
    id: NOUL_PACK_ID,
    contentVersion: NOUL_PACK_VERSION,
    rules,
  },
  "built-in:noul",
  { layer: "built-in", source: "built-in:noul", field: "bundled.noul" },
);

export { messages as NOUL_MESSAGES };
