import { cases as allCases, tasks as allTasks } from '../../scripts/abide-rule-coverage-fixtures.mjs';
export const cases = allCases.filter(fixture => fixture.ruleId === 'r9_body_reaches_undeclared');
export const tasks = allTasks.filter(task => cases.some(fixture => fixture.id === task.caseId));
