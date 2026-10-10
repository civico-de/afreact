import { coreHas } from "./version";

// dev/core#6424 reached 6.12.4 and 6.13.1 but not 6.13.0.
const FIX = { "6.12": "6.12.4", "6.13": "6.13.1" };

describe("coreHas", () => {
  it("compares with the first patch on the running minor's branch", () => {
    expect(coreHas("6.12.3", FIX)).toBe(false);
    expect(coreHas("6.12.4", FIX)).toBe(true);
    expect(coreHas("6.13.0", FIX)).toBe(false);
    expect(coreHas("6.13.1", FIX)).toBe(true);
  });

  it("treats minors after the listed ones as having it, older ones as not", () => {
    expect(coreHas("6.14.0", FIX)).toBe(true);
    expect(coreHas("6.21.alpha1", FIX)).toBe(true);
    expect(coreHas("6.11.9", FIX)).toBe(false);
  });

  it("puts a pre-release before its .0", () => {
    expect(coreHas("6.20.beta1", { "6.20": "6.20.0" })).toBe(false);
    expect(coreHas("6.20.0", { "6.20": "6.20.0" })).toBe(true);
  });

  it("refuses an unreadable version", () => {
    expect(() => coreHas("master", FIX)).toThrow(/Unreadable/);
  });
});
