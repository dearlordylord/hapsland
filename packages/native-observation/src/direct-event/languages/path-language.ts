import { extname } from "node:path"

/** Parser-free analyzer registrations shared by path selection and analyzer adapters. */
export const LANGUAGE_EXTENSIONS = {
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  rust: [".rs"],
  bend: [".bend"]
} as const
export type RootLanguage = keyof typeof LANGUAGE_EXTENSIONS

export const rootLanguageForPath = (path: string): RootLanguage | undefined => {
  const extension = extname(path).toLowerCase()
  return (Object.keys(LANGUAGE_EXTENSIONS) as RootLanguage[]).find((language) =>
    (LANGUAGE_EXTENSIONS[language] as ReadonlyArray<string>).includes(extension)
  )
}
