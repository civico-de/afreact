import { describe, expect, it } from "vitest";
import { matchIcons, parseIcons } from "./IconPicker";

const css = `.fa-home:before { content: "\\f015"; }
.fa-house:before { content: "\\f015"; }
.fa-user::before { content: "\\f007"; }
.fa-trash-o:before { content: "\\f014"; }`;

describe("icon list", () => {
  it("lists each glyph once and keeps further names as aliases", () => {
    const list = parseIcons(css);
    expect(list.icons).toEqual(["fa-home", "fa-user", "fa-trash-o"]);
    expect(list.aliases).toEqual({ "fa-home": ["fahouse"] });
  });

  it("matches names and aliases ignoring dashes and case", () => {
    const list = parseIcons(css);
    expect(matchIcons(list, "House")).toEqual(["fa-home"]);
    expect(matchIcons(list, "trasho")).toEqual(["fa-trash-o"]);
    expect(matchIcons(list, "")).toEqual(list.icons);
  });
});
