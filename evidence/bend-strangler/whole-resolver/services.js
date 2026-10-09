function perform(request, options) {
  const sessions = globalThis.__hapslandWholeResolverServices;
  const raw = request.invocation;
  if (typeof raw === 'bigint' ? raw < 0n || raw > BigInt(Number.MAX_SAFE_INTEGER) : !Number.isSafeInteger(raw) || raw < 0) throw new Error('unsafe invocation');
  const session = sessions?.get(Number(raw));
  if (!session) throw new Error('unknown resolver invocation');
  return session.perform(request, options);
}
io_eff(CID(perform), perform);
