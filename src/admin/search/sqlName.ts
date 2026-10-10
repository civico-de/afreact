import { md5 } from "../md5";

/** Core's CRM.utils.munge, which falls back to a random name when nothing usable is left. */
function munge(name: string, length: number): string {
  let munged = name.trim().replace(/[^a-zA-Z0-9]+/g, "_");
  if (!munged.replace(/_/, "").length) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    munged = Array.from(
      crypto.getRandomValues(new Uint8Array(length)),
      (n) => chars[n % chars.length],
    ).join("");
  }
  return munged.substring(0, length);
}

/** The DB entity column name the server makes from a column key (`searchMeta.createSqlName`). */
export function createSqlName(key: string): string {
  const name = key.split(":")[0] ?? "";
  return name.length <= 58 ? munge(name, 63) : munge(name, 42) + md5(name).substring(0, 16);
}
