// RFC 9562 UUIDv7. Hub write keys are minted once and then reused, so a retry
// hits the same idempotency row instead of opening a second one.

export function mintUuidV7(nowMs: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  const rand = new Uint8Array(10);
  globalThis.crypto.getRandomValues(rand);
  const ms = Math.floor(nowMs);
  // 48-bit big-endian millisecond timestamp.
  const hi = Math.floor(ms / 2 ** 32);
  const lo = ms >>> 0;
  bytes[0] = (hi >>> 8) & 0xff;
  bytes[1] = hi & 0xff;
  bytes[2] = (lo >>> 24) & 0xff;
  bytes[3] = (lo >>> 16) & 0xff;
  bytes[4] = (lo >>> 8) & 0xff;
  bytes[5] = lo & 0xff;
  bytes.set(rand, 6);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
