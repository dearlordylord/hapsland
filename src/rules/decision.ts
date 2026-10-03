import { initialCanonical, probabilityWords, stepCanonical, type CanonicalEvent } from "../canonical/adapter.ts";

const initial = initialCanonical({ globalItems: 1, globalBytes: 1, partitionItems: 1, partitionBytes: 1 });

const ruleTransitionAccepted = (result: ReturnType<typeof stepCanonical>): boolean =>
  result.rejection === undefined && result.commands.length === 1;

const decide = (event: CanonicalEvent) => {
  const result = stepCanonical(initial, event);
  if (!ruleTransitionAccepted(result)) {
    throw new Error("canonical rule decision refused");
  }
  return result.commands[0];
};

const gate = (event: CanonicalEvent): boolean => {
  const command = decide(event);
  if (command?.kind !== "ruleGate") throw new Error("canonical rule gate missing");
  return command.gate === "admit";
};

export const includeRule = (packEnabled: boolean, ruleEnabled: boolean): boolean =>
  gate({ kind: "ruleEnableCheck", packEnabled, ruleEnabled });

export const applicableRule = (facts: {
  readonly consent: boolean;
  readonly complete: boolean;
  readonly target: "typeShape" | "functionTarget" | "unsupportedTarget";
  readonly globalIncluded: boolean;
  readonly globalExcluded: boolean;
  readonly packEnabled: boolean;
  readonly ruleEnabled: boolean;
  readonly ruleIncluded: boolean;
  readonly ruleExcluded: boolean;
  readonly targetDeclared: boolean;
  readonly capabilitiesAvailable: boolean;
  readonly sourceRung: number;
  readonly minimumRung: number;
}): boolean => gate({ kind: "ruleApplicabilityCheck", ...facts });

export const findingFromProbability = (probability: number, threshold: number): boolean => {
  const observed = probabilityWords(probability);
  const configured = probabilityWords(threshold);
  return gate({ kind: "ruleFindingCheck", probability: observed, threshold: configured });
};

const decodedOrder = (event: CanonicalEvent): number => {
  const command = decide(event);
  if (command?.kind !== "ruleOrder") throw new Error("canonical rule order missing");
  return command.order === "before" ? -1 : command.order === "after" ? 1 : 0;
};

export const compareRuleRank = (
  left: { readonly probability: number; readonly rank: number },
  right: { readonly probability: number; readonly rank: number },
): number => {
  const a = probabilityWords(left.probability);
  const b = probabilityWords(right.probability);
  return decodedOrder({ kind: "ruleRankOrderCheck", left: a, right: b, leftRank: left.rank, rightRank: right.rank });
};

const nativeOrder = (value: number): "before" | "equal" | "after" =>
  value < 0 ? "before" : value > 0 ? "after" : "equal";

export const compareAdviceOrder = (
  left: { readonly probability: number; readonly path: string; readonly ruleId: string },
  right: { readonly probability: number; readonly path: string; readonly ruleId: string },
): number => {
  const a = probabilityWords(left.probability);
  const b = probabilityWords(right.probability);
  return decodedOrder({
    kind: "adviceOrderCheck",
    left: a,
    right: b,
    pathOrder: nativeOrder(left.path.localeCompare(right.path)),
    idOrder: nativeOrder(left.ruleId.localeCompare(right.ruleId)),
  });
};

export const withinAdviceBudget = (position: number, limit: number): boolean =>
  gate({ kind: "ruleBudgetCheck", position, limit });
