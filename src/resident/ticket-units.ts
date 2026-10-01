import type { TicketRecord } from "./ticket-records.ts";
import type { CanonicalCommand, TicketReason, TicketUnitEvent } from "../canonical/adapter.ts";
import type { CapacityLedger } from "./capacity.ts";
import type { WorkRevision } from "./revision.ts";

export type TicketUnitCurrent = { readonly revision?: WorkRevision; readonly adviceId?: string };
export type TicketUnitSnapshot = Extract<CanonicalCommand, { readonly kind: "ticketUnitSnapshot" }>;
export interface TicketUnit {
  readonly id: number;
  readonly ticketId: number;
  readonly current: TicketUnitCurrent;
  readonly stage: () => TicketUnitSnapshot | undefined;
  readonly step: (event: TicketUnitEvent, reason?: TicketReason, current?: TicketUnitCurrent) => boolean;
}
export type TicketUnitsState = {
  readonly entries: ReadonlyMap<number, { readonly capability: TicketUnit; readonly current: TicketUnitCurrent }>;
  readonly nextId: number;
};
export const initialTicketUnits = (): TicketUnitsState => ({ entries: new Map(), nextId: 1 });
export const draftTicketUnits = (state: TicketUnitsState) => ({ entries: new Map(state.entries), nextId: state.nextId });
export const emptyTicketUnitCurrent: TicketUnitCurrent = Object.freeze({});

export const ticketUnitView = (state: TicketUnitsState, ledger: Pick<CapacityLedger, "transition">) => {
  const stage = (unit: TicketUnit): TicketUnitSnapshot | undefined => {
    if (state.entries.get(unit.id)?.capability !== unit) return undefined;
    const command = ledger.transition({ kind: "ticketUnitCheck", id: unit.ticketId, unit: unit.id }).commands[0];
    if (command?.kind === "ticketUnitSnapshot") return command;
    if (command?.kind === "ticketUnitMissing") return undefined;
    throw new Error("canonical ticket unit check refused");
  };
  return { stage };
};

export const ticketUnitOperations = (draft: ReturnType<typeof draftTicketUnits>, ledger: Pick<CapacityLedger, "transition">) => {
  const { stage } = ticketUnitView(draft, ledger);
  return {
    stage,
    add: (ticketId: number, capability: (id: number, ticketId: number) => TicketUnit): TicketUnit => {
      const id = draft.nextId++;
      const result = ledger.transition({ kind: "ticketAddUnit", id: ticketId, unit: id });
      if (result.commands[0]?.kind !== "ticketUnitAdded") throw new Error("canonical ticket unit admission refused");
      const unit = capability(id, ticketId);
      draft.entries.set(id, { capability: unit, current: emptyTicketUnitCurrent });
      return unit;
    },
    step: (unit: TicketUnit, event: TicketUnitEvent, reason: TicketReason = "lost", current?: TicketUnitCurrent): boolean => {
      if (stage(unit) === undefined) return false;
      const result = ledger.transition({ kind: "ticketStepUnit", id: unit.ticketId, unit: unit.id, event, reason });
      if (result.commands[0]?.kind === "ticketRefused") return false;
      if (result.commands[0]?.kind !== "ticketUnitUpdated") throw new Error("canonical ticket unit transition refused");
      if (current !== undefined) draft.entries.set(unit.id, { capability: unit, current: Object.freeze({ ...current }) });
      const next = stage(unit);
      const metadata = draft.entries.get(unit.id)?.current;
      if (next === undefined || metadata === undefined ||
          (next.stage === "finding" && (metadata.revision === undefined || metadata.adviceId === undefined)) ||
          (next.stage === "clear" && (metadata.revision === undefined || metadata.adviceId !== undefined)) ||
          (next.stage === "pending" && metadata.adviceId !== undefined) ||
          (next.stage === "unavailable" && (metadata.revision !== undefined || metadata.adviceId !== undefined))) {
        throw new Error("native ticket unit metadata differs from its canonical stage");
      }
      return true;
    },
    forget: (ticketId: number): void => {
      for (const [id, entry] of draft.entries) if (entry.capability.ticketId === ticketId) draft.entries.delete(id);
    },
  };
};
export interface TicketUnits {
  readonly add: (record: TicketRecord) => TicketUnit;
  readonly values: () => ReadonlyArray<TicketUnit>;
}
