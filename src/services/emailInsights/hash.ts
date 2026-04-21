/** Stable short fingerprint of body text for cache invalidation. */
export function emailBodyContentHash(body: string): string {
  const t = body.slice(0, 12_000);
  let h = 2_166_136_261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return `${(h >>> 0).toString(16)}:${t.length}`;
}
