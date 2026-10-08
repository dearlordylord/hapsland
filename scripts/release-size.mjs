import { statSync } from "node:fs"

// Local publication budget, not a claim about npm's undocumented registry limit.
// npm embeds the archive as base64 in a JSON PUT body.
export const RELEASE_ARCHIVE_MAX_BYTES = 64 * 1024 * 1024
export function checkReleaseSize(path) {
  const bytes = statSync(path).size
  const attachmentBytes = 4 * Math.ceil(bytes / 3)
  if (bytes > RELEASE_ARCHIVE_MAX_BYTES)
    throw new Error(
      `Release archive exceeds the 64 MiB publication budget: ${bytes} archive bytes, ${attachmentBytes} base64 attachment bytes. Reduce packaging before publishing.`
    )
  return { bytes, attachmentBytes }
}
