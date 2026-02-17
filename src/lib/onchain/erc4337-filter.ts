function normalizeAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const lowered = value.toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(lowered) ? lowered : null;
}

export function shouldPersist4337Log(
  args: Record<string, unknown>,
  knownWallets: Set<string>
): boolean {
  const sender = normalizeAddress(args.sender);
  if (!sender) return false;
  return knownWallets.has(sender);
}
