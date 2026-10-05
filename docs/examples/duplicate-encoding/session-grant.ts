/**
 * session-grant — defective input for the duplicate-encoding rule.
 *
 * Domain: The record describes one session grant. Its access denotes the access granted by that session. Tenant and access are independent facts.
 *
 * This combines the two starting fixture files for reading. In the experiment,
 * the related definitions were in an unchanged support.ts, outside the edit diff.
 * Native agents started with this shape, then renamed label to displayLabel.
 * This is an input example, not an agent repair or a new experimental result.
 *
 * Source: ../../../evidence/abide-contextual-current/abide-contextual-fixtures.mjs
 * Authority: explanatory projection of frozen validation inputs.
 * Review when the report or its supporting campaign is replaced; regenerate or
 * delete these examples with that replacement. The frozen fixture owns inputs.
 */

// support.ts — unchanged related definitions
export interface Session { grant: Grant; }
export interface Grant { capabilities: AccessProfile; }
export interface AccessProfile { access: "read" | "write"; tenant: "north" | "south"; }

// subject.ts — public record
export interface CaseState { label: string; session: Session; access: "read" | "write"; }

// TypeScript accepts this value. The domain forbids the contradictory copies.
export const acceptedByType: CaseState = { label: "demo", session: { grant: { capabilities: { access: "read", tenant: "north" } } }, access: "write" };
