export function bendTime(ms: number): number {
  return Math.floor(ms * 1000)
}

export function bendUpperTime(ms: number): number {
  return Math.ceil(ms * 1000)
}
