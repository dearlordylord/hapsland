import { parseTraceTape, summarizeRun } from "../src";

const input = `# One test run
RUN|demo-run|2026-04-11T09:30:00Z
CASE|greeting|examples|prints a greeting
BEGIN|greeting|2026-04-11T09:30:00.010Z
LOG|greeting|info|starting
END|greeting|pass|18|
DONE|2026-04-11T09:30:00.100Z`;

const document = parseTraceTape(input);
console.log(summarizeRun(document));
