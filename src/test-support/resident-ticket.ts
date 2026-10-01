import type { TicketRecord } from "../resident/ticket-records.ts";

export const residentTicketInput = (lifetime: string, nonce = "ticket", partition = "fixture"): Omit<TicketRecord, "generation"> => ({
  ticket: { nonce, lifetime }, partition, editAuthority: "edit", credentialGeneration: null,
  root: "/fixture", userConfigPath: null, claudeFeedbackMode: "advisory",
  credentialStatePath: null, credentialRequired: false, credentialEnvironmentOnly: false, expiresAt: 600_000,
});
