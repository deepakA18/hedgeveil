// Historical testnet recovery only. Liabilities and operating allocations are never swept.
export const RECOVERY_BUFFER = 10n ** 23n; // 0.1 NEAR for subsequent gas/reads and receipt callbacks.
export function coreSurplus(snapshot, balance) {
  if (snapshot.pending_in_flight !== '0' || snapshot.unknown_in_flight !== '0') throw Error('RECOVERY_UNRESOLVED_PAYOUT');
  const storage = BigInt(snapshot.storage_bytes) * BigInt(snapshot.storage_byte_cost);
  const retained = BigInt(snapshot.retained_categories);
  const floor = (retained > storage ? retained : storage) + RECOVERY_BUFFER;
  const surplus = BigInt(balance) - floor;
  return surplus > 0n ? surplus : 0n;
}
export function walletSurplus(balance, storageBytes, byteCost) {
  const surplus=BigInt(balance)-BigInt(storageBytes)*BigInt(byteCost)-RECOVERY_BUFFER;
  return surplus>0n?surplus:0n;
}
