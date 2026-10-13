import { describe, expect, it } from "vitest";
import { mockApi } from "../../test/render";
import { saveAfform } from "./save";

describe("saveAfform", () => {
  // deviation:save-sends-html
  it("saves a shallow layout as the HTML core converts it to", async () => {
    const layout = [{ "#tag": "af-entity", actions: "{create: true, update: false}" }];
    const html = '<af-entity actions="{create: true, update: false}" />';
    const calls = mockApi({
      "Afform.convert": () => [{ layout: html }],
      // Core echoes the record it was sent.
      "Afform.save": () => [{ name: "afformNew", title: "New", layout: html }],
    });
    expect(await saveAfform({ title: "New", layout })).toEqual({
      name: "afformNew",
      title: "New",
      layout,
    });
    expect(calls).toEqual([
      {
        call: "Afform.convert",
        params: { layout, from: "shallow", to: "html", formatWhitespace: true },
      },
      {
        call: "Afform.save",
        params: {
          records: [
            { title: "New", layout: '<af-entity actions="{create: true, update: false}" />' },
          ],
        },
      },
    ]);
  });

  it("saves a record without a layout as it is", async () => {
    const calls = mockApi({ "Afform.save": () => [{ name: "afformOld" }] });
    await saveAfform({ name: "afformOld", title: "Old" });
    expect(calls).toEqual([
      { call: "Afform.save", params: { records: [{ name: "afformOld", title: "Old" }] } },
    ]);
  });
});
