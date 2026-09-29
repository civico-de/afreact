import { pageLinks } from "./pages";

const labels = (current: number, total: number) =>
  pageLinks(current, total).map((link) => (link.active ? `[${link.label}]` : link.label));

describe("pageLinks", () => {
  it("lists every page up to five", () => {
    expect(labels(1, 3)).toEqual(["[1]", "2", "3"]);
    expect(labels(5, 5)).toEqual(["1", "2", "3", "4", "[5]"]);
  });

  it("keeps the current page centred between the first and last page", () => {
    expect(labels(1, 20)).toEqual(["[1]", "2", "3", "4", "5", "...", "20"]);
    expect(labels(10, 20)).toEqual(["1", "...", "8", "9", "[10]", "11", "12", "...", "20"]);
    expect(labels(20, 20)).toEqual(["1", "...", "16", "17", "18", "19", "[20]"]);
  });

  it("shows a page number instead of an ellipsis that would hide one page", () => {
    expect(labels(5, 20)).toEqual(["1", "2", "3", "4", "[5]", "6", "7", "...", "20"]);
    expect(labels(5, 9)).toEqual(["1", "2", "3", "4", "[5]", "6", "7", "8", "9"]);
  });

  it("jumps from an ellipsis to the page next to the visible range", () => {
    const links = pageLinks(10, 20);
    expect(links[1]).toEqual({ number: 7, label: "...", active: false });
    expect(links.at(-2)).toEqual({ number: 13, label: "...", active: false });
  });
});
