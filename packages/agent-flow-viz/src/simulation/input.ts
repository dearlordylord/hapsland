export class InputError extends Error {}
export const speedValue = (raw: string) => {
  const value = Number(raw)
  if (!raw.trim() || !Number.isFinite(value) || value < 0.01 || value > 1000)
    throw new InputError("Playback speed must be a number from 0.01 to 1000.")
  return value
}
export const number = (raw: string, name: string, min: number, max: number) => {
  const value = Number(raw)
  if (!raw.trim() || !Number.isSafeInteger(value) || value < min || value > max)
    throw new InputError(`${name} must be an integer from ${min} to ${max}.`)
  return value
}
