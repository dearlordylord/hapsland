import {cases as allCases,tasks as allTasks} from './abide-rule-coverage-fixtures.mjs';
export const cases=allCases.filter(c=>c.ruleId==="r1_inferred_case");
export const tasks=allTasks.filter(t=>t.ruleId==="r1_inferred_case");
