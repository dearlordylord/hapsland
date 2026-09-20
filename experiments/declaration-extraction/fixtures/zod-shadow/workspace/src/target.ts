import { z } from "zod";

const ordinaryWrapper = <T>(factory: (Address: T) => T, value: T) => factory(value);
const wrap = <T>(schema: T): T => schema;

export const Address = z.object({ id: z.string(), label: z.string() });
export const GenuineWrapper = wrap(Address);
export const ShadowWrapper = ordinaryWrapper((Address: unknown) => Address, Address);
