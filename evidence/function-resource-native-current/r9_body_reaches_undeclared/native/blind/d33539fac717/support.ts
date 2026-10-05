export const auditEntries: string[] = [];
export function recordAudit(text: string): void { auditEntries.push(text); }
