import { extname } from "node:path";
import type { LanguageAdapter } from "./contracts.ts";
import { tsAdapter } from "./typescript.ts";
import { rustAdapter } from "./rust-adapter.ts";
import { bendAdapter } from "./bend/adapter.ts";
export const registeredLanguages: readonly LanguageAdapter[] = [
  tsAdapter,
  rustAdapter,
  bendAdapter,
];

export const languageForPath = (path: string): LanguageAdapter | undefined =>
  registeredLanguages.find((language) =>
    language.extensions.includes(extname(path).toLowerCase()),
  );
