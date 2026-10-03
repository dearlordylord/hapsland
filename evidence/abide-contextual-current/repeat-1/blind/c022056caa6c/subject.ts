import type { Session } from "./support";
export interface CaseState { displayLabel: string; session: Session; access: "read" | "write"; }
