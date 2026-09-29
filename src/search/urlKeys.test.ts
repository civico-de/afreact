import {
  displayKeys,
  parseSort,
  positiveInteger,
  sortParser,
  sortText,
  type Sort,
} from "./urlKeys";

describe("URL keys", () => {
  it("carry a display's prefix", () => {
    expect(displayKeys("")).toEqual({ sort: "_sort", page: "_page", limit: "_limit" });
    expect(displayKeys("Manage_groups.")).toEqual({
      sort: "Manage_groups._sort",
      page: "Manage_groups._page",
      limit: "Manage_groups._limit",
    });
  });

  it("write a sort as keys with - for descending, and read it back", () => {
    const sort: Sort = [
      ["title", "ASC"],
      ["created_date", "DESC"],
    ];
    expect(sortText(sort)).toBe("title,-created_date");
    expect(parseSort("title,-created_date")).toEqual(sort);
    expect(parseSort("")).toBeNull();
    expect(parseSort(",")).toBeNull();
    expect(sortParser.eq([["a", "ASC"]], [["a", "ASC"]])).toBe(true);
    expect(sortParser.eq([["a", "ASC"]], [["a", "DESC"]])).toBe(false);
  });

  it("take page numbers and sizes of 1 and more only", () => {
    expect(positiveInteger.parse("3")).toBe(3);
    expect(positiveInteger.parse("0")).toBeNull();
    expect(positiveInteger.parse("-2")).toBeNull();
    expect(positiveInteger.parse("x")).toBeNull();
    expect(positiveInteger.serialize(4)).toBe("4");
  });
});
