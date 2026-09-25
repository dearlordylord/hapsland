const ruleIds = [
  'r1_inferred_case', 'r2_meaningless_combinations', 'r3_split_correlations',
  'r4_duplicate_encoding', 'r5_absence_confusion', 'r6_bare_domain_value',
  'r7_name_wider_than_type', 'r8_name_claims_resource', 'r9_body_reaches_undeclared',
];

export const controlledAnswers = Object.freeze(Object.fromEntries(ruleIds.map((id) => [
  id, Object.freeze({ _tag: 'Probability', probability: id === 'r6_bare_domain_value' ? 0.9 : 0 }),
])));
