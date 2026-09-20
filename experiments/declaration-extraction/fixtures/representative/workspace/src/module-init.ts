import { writeFileSync } from "node:fs";

// This marker is intentionally never created. The extractor must not import or
// evaluate edited project modules to obtain runtime schema objects.
writeFileSync(".module-init.marker", "evaluated");
