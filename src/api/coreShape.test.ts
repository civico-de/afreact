import type { UnknownKeys } from "./coreShape";

describe("UnknownKeys", () => {
  it("is never when the hand-written type declares every key", () => {
    expectTypeOf<UnknownKeys<{ a: string; b?: number }, { a: string }>>().toBeNever();
    expectTypeOf<UnknownKeys<Record<string, unknown>, { any: string }>>().toBeNever();
    expectTypeOf<UnknownKeys<{ settings: unknown }, { settings: { a: number } }>>().toBeNever();
  });

  it("names new keys at any depth, through lists, unions and records", () => {
    type Hand = { attrs?: { min?: number } | null; options?: { id: string }[] | false };
    type Seen = {
      attrs: { min: number; min_length: number } | never[];
      options: boolean | { id: string; color: string }[];
      extra: Record<string, { x: number }>;
    };
    expectTypeOf<UnknownKeys<Hand, Seen>>().toEqualTypeOf<
      "attrs.min_length" | "options[].color" | "extra"
    >();
  });

  it("treats an object where the hand-written type has only a list or scalar as unknown", () => {
    expectTypeOf<UnknownKeys<{ a: string[] }, { a: { b: string } }>>().toEqualTypeOf<"a.b">();
  });
});
