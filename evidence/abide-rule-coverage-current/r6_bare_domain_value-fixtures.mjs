import {cases as allCases,tasks as allTasks} from './abide-rule-coverage-fixtures.mjs';
export const cases=allCases.filter(c=>c.ruleId==="r6_bare_domain_value");
export const tasks=allTasks.filter(t=>t.ruleId==="r6_bare_domain_value");
