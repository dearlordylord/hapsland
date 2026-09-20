import { z } from "zod";

export const Branded = z.string().brand("UserId");
export const Checked = z.string().check((value) => value.length > 0);
export const Refined = z.string().refine((value) => value.length > 0);
export const Transformed = z.string().transform((value) => value.trim());
