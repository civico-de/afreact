/** MD5 of a string's UTF-8 bytes as hex; core shortens long SQL column names with it. */
export function md5(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const words = new Uint32Array((((bytes.length + 8) >>> 6) + 1) * 16);
  bytes.forEach((byte, i) => {
    words[i >> 2] = (words[i >> 2] ?? 0) | (byte << ((i % 4) * 8));
  });
  words[bytes.length >> 2] = (words[bytes.length >> 2] ?? 0) | (0x80 << ((bytes.length % 4) * 8));
  words[words.length - 2] = bytes.length * 8;
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const k = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let block = 0; block < words.length; block += 16) {
    let [a = 0, b = 0, c = 0, d = 0] = state;
    for (let i = 0; i < 64; i++) {
      const round = i >> 4;
      const f = [(b & c) | (~b & d), (d & b) | (~d & c), b ^ c ^ d, c ^ (b | ~d)][round] ?? 0;
      const g = [i, (5 * i + 1) % 16, (3 * i + 5) % 16, (7 * i) % 16][round] ?? 0;
      const sum = (a + f + (k[i] ?? 0) + (words[block + g] ?? 0)) | 0;
      const shift = shifts[round * 4 + (i % 4)] ?? 0;
      [a, d, c] = [d, c, b];
      b = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
    }
    state[0] = ((state[0] ?? 0) + a) | 0;
    state[1] = ((state[1] ?? 0) + b) | 0;
    state[2] = ((state[2] ?? 0) + c) | 0;
    state[3] = ((state[3] ?? 0) + d) | 0;
  }
  return state
    .map((word) =>
      Array.from({ length: 4 }, (_, i) =>
        ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, "0"),
      ).join(""),
    )
    .join("");
}
