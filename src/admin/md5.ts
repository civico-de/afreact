const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const K = Array.from(
  { length: 64 },
  (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0,
);

/** MD5 of `text` as UTF-8, in hex (RFC 1321). */
export function md5(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (bytes.length * 8) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bytes.length / 2 ** 29), true);
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let block = 0; block < padded.length; block += 64) {
    let a = h[0] ?? 0;
    let b = h[1] ?? 0;
    let c = h[2] ?? 0;
    let d = h[3] ?? 0;
    for (let i = 0; i < 64; i++) {
      const round = i >> 4;
      const f =
        round === 0
          ? (b & c) | (~b & d)
          : round === 1
            ? (d & b) | (~d & c)
            : round === 2
              ? b ^ c ^ d
              : c ^ (b | ~d);
      const g =
        round === 0
          ? i
          : round === 1
            ? (5 * i + 1) % 16
            : round === 2
              ? (3 * i + 5) % 16
              : (7 * i) % 16;
      const sum = (a + f + (K[i] ?? 0) + view.getUint32(block + g * 4, true)) | 0;
      const shift = S[round * 4 + (i % 4)] ?? 0;
      [a, d, c] = [d, c, b];
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
    }
    h[0] = ((h[0] ?? 0) + a) | 0;
    h[1] = ((h[1] ?? 0) + b) | 0;
    h[2] = ((h[2] ?? 0) + c) | 0;
    h[3] = ((h[3] ?? 0) + d) | 0;
  }
  return h
    .map((word) =>
      [0, 8, 16, 24].map((s) => ((word >>> s) & 0xff).toString(16).padStart(2, "0")).join(""),
    )
    .join("");
}
