export const OPERATIONAL_NOTICE_COOLDOWN_MS = 60_000

export const MAX_OPERATIONAL_NOTICE_KEYS = 64

const validOperationalNoticeKeys = (count: number): boolean =>
  Number.isSafeInteger(count) && count >= 1 && count <= MAX_OPERATIONAL_NOTICE_KEYS

export const validatedOperationalNoticeKeys = (requested: number | undefined): number => {
  const count = requested ?? MAX_OPERATIONAL_NOTICE_KEYS
  if (!validOperationalNoticeKeys(count))
    throw new RangeError(`maximumOperationalNoticeKeys must be an integer from 1 to ${MAX_OPERATIONAL_NOTICE_KEYS}`)
  return count
}
