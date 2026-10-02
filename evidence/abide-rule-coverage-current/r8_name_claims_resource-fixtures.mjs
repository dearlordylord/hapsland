import {cases as allCases,tasks as allTasks} from './abide-rule-coverage-fixtures.mjs';
export const cases=allCases.filter(c=>c.ruleId==="r8_name_claims_resource");
export const tasks=allTasks.filter(t=>t.ruleId==="r8_name_claims_resource");
