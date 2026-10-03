import { cases as allCases, tasks as allTasks } from './all-rule-fixtures.mjs';
export const cases = allCases.filter(c => c.ruleId === 'r9_body_reaches_undeclared');
export const tasks = allTasks.filter(t => t.ruleId === 'r9_body_reaches_undeclared');
