import { comparedPages } from "./AfreactCompare";

describe("comparedPages", () => {
  it("reads the page list and rejects anything else", () => {
    expect(comparedPages('[{"label": "A", "url": "/a"}]')).toEqual([{ label: "A", url: "/a" }]);
    for (const json of ["[]", '[{"label": "A"}]', '{"label": "A", "url": "/a"}']) {
      expect(() => comparedPages(json)).toThrow("needs pages as a JSON list");
    }
  });
});
