/** Freeze a trusted data graph once, preserving shared immutable subgraphs. */
export const freezeCanonicalData = <A>(value: A): A => {
  const pending: unknown[] = [value];
  const visited = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current !== "object" || current === null || Object.isFrozen(current) || visited.has(current)) continue;
    visited.add(current);
    pending.push(...Object.values(current));
    Object.freeze(current);
  }
  return value;
};
