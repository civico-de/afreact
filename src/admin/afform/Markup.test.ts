import { validLayout } from "./Markup";

describe("validLayout", () => {
  it("refuses anything but a non-empty list of nodes", () => {
    expect(validLayout("block", "<div></div>")).toBe(false);
    expect(validLayout("block", { "#tag": "div" })).toBe(false);
    expect(validLayout("block", [])).toBe(false);
    expect(validLayout("block", [{ "#tag": "div", hidden: true }])).toBe(false);
    expect(validLayout("block", [{ "#tag": "div", "#children": [{ class: "x" }] }])).toBe(false);
    expect(validLayout("block", [{ "#text": "Hello" }, { "#comment": "note" }])).toBe(true);
  });

  it("needs exactly one af-form in a form, none in a block", () => {
    const form = { "#tag": "af-form", ctrl: "afform" };
    expect(validLayout("form", [{ "#tag": "div" }])).toBe(false);
    expect(validLayout("form", [form])).toBe(true);
    expect(validLayout("form", [{ "#tag": "div", "#children": [form] }])).toBe(true);
    expect(validLayout("form", [form, form])).toBe(false);
    expect(validLayout("block", [{ "#tag": "div" }])).toBe(true);
  });
});
