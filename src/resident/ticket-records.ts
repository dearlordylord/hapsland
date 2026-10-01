import type { Effect } from "effect";
import type { ResidentCollectionTicket } from "./protocol.ts";
import type { ClaudeOutputMode } from "./collection.ts";
import type { CapacityLedger } from "./capacity.ts";

export type TicketRecord = {
  readonly ticket: ResidentCollectionTicket;
  readonly generation: number;
  readonly partition: string;
  readonly editAuthority: string;
  readonly credentialGeneration: number | null;
  readonly root: string;
  readonly userConfigPath: string | null;
  readonly claudeFeedbackMode: ClaudeOutputMode;
  readonly credentialStatePath: string | null;
  readonly credentialRequired: boolean;
  readonly credentialEnvironmentOnly: boolean;
  readonly expiresAt: number;
};
export type TicketRecordsState = {
  readonly entries: ReadonlyMap<string, TicketRecord>;
  readonly nextGeneration: number;
};
export const initialTicketRecords = (): TicketRecordsState => ({ entries: new Map(), nextGeneration: 1 });
export const draftTicketRecords = (state: TicketRecordsState) => ({ entries: new Map(state.entries), nextGeneration: state.nextGeneration });
export const ticketRecordOperations = (
  draft: ReturnType<typeof draftTicketRecords>,
  ledger: Pick<CapacityLedger, "transition" | "canonicalProjection" | "residentLifetime">,
  forgetUnits: (ticketId: number) => void,
) => {
  const forget = (record: TicketRecord): boolean => {
    if (draft.entries.get(record.ticket.nonce) !== record) return false;
    const result = ledger.transition({ kind: "ticketForget", id: record.generation });
    if (result.rejection !== undefined || result.commands[0]?.kind !== "ticketForgotten") throw new Error("canonical ticket retirement refused");
    draft.entries.delete(record.ticket.nonce);
    forgetUnits(record.generation);
    return true;
  };
  return {
    open: (input: Omit<TicketRecord, "generation">): TicketRecord => {
      if (input.ticket.lifetime !== ledger.residentLifetime || draft.entries.has(input.ticket.nonce)) {
        throw new Error("native ticket admission identity refused");
      }
      const generation = draft.nextGeneration++;
      const result = ledger.transition({ kind: "ticketOpen", id: generation });
      if (result.rejection !== undefined || result.commands[0]?.kind !== "ticketOpened") throw new Error("canonical ticket open refused");
      const record = Object.freeze({ ...input, generation, ticket: Object.freeze({ ...input.ticket }) });
      draft.entries.set(record.ticket.nonce, record);
      return record;
    },
    forget,
    discardPartition: (partition: string): void => {
      for (const record of draft.entries.values()) if (record.partition === partition) forget(record);
    },
    retain: (limit: number): void => {
      while (true) {
        const result = ledger.transition({ kind: "ticketRetentionCheck", limit });
        const command = result.commands[0];
        if (result.rejection !== undefined || command === undefined) throw new Error("canonical ticket retention refused");
        if (command.kind === "ticketKept") return;
        if (command.kind !== "ticketEvicted") throw new Error("invalid canonical ticket retention");
        const first = draft.entries.entries().next().value;
        if (first === undefined || first[1].generation !== command.id) throw new Error("canonical ticket admission order differs from native retention");
        draft.entries.delete(first[0]);
        forgetUnits(command.id);
      }
    },
    assert: (): void => {
      const canonical = ledger.canonicalProjection().tickets;
      const native = [...draft.entries.values()];
      const nativeIds = new Set(native.map((record) => record.generation));
      if (canonical.length !== native.length || nativeIds.size !== native.length || canonical.some((ticket) => !nativeIds.has(ticket.id))) {
        throw new Error("native ticket admissions differ from canonical ownership");
      }
    },
  };
};
export interface TicketRecords {
  readonly open: (input: Omit<TicketRecord, "generation">) => Effect.Effect<TicketRecord>;
  readonly get: (nonce: string) => Effect.Effect<TicketRecord | undefined>;
  readonly forget: (record: TicketRecord) => Effect.Effect<boolean>;
  readonly discardPartition: (partition: string) => Effect.Effect<void>;
  readonly retain: (limit: number) => Effect.Effect<void>;
}
