import {cases as allCases,tasks as allTasks} from './abide-rule-coverage-fixtures.mjs';
export const cases=allCases.filter(c=>c.ruleId==="r2_meaningless_combinations");
export const tasks=allTasks.filter(t=>t.ruleId==="r2_meaningless_combinations");
