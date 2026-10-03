import {cases as allCases,tasks as allTasks} from './abide-rule-coverage-fixtures.mjs';
export const cases=allCases.filter(c=>c.ruleId==="r7_name_wider_than_type");
export const tasks=allTasks.filter(t=>t.ruleId==="r7_name_wider_than_type");
