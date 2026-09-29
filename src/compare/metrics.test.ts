import { isReady, median, resourceMetrics } from "./metrics";

describe("resourceMetrics", () => {
  it("classifies API, script, style and other XHR bytes", () => {
    expect(
      resourceMetrics([
        {
          name: "http://x/civicrm/ajax/api4/Contact/get",
          initiatorType: "xmlhttprequest",
          encodedBodySize: 10,
        },
        { name: "http://x/civicrm/ajax/api4", initiatorType: "fetch", encodedBodySize: 5 },
        { name: "http://x/modules.json", initiatorType: "xmlhttprequest", encodedBodySize: 7 },
        { name: "http://x/a.js", initiatorType: "script", encodedBodySize: 100 },
        { name: "http://x/a.css", initiatorType: "link", encodedBodySize: 20 },
        { name: "http://x/b.css", initiatorType: "css", encodedBodySize: 3 },
        { name: "http://x/i.png", initiatorType: "img", encodedBodySize: 50 },
      ]),
    ).toEqual({ requests: 7, apiRequests: 2, scriptBytes: 100, styleBytes: 23, otherXhrBytes: 7 });
  });
});

describe("isReady", () => {
  const page = (table: string) =>
    new DOMParser().parseFromString(
      `<div class="afreact-demo"><section><input></section><section><table><tbody>${table}</tbody></table></section></div>`,
      "text/html",
    );

  it("waits for a linked data row, not a placeholder row", () => {
    expect(
      isReady(page('<tr><td><div class="crm-search-loading-placeholder"></div></td></tr>')),
    ).toBe(false);
    expect(isReady(page('<tr><td><a href="/x">Ada</a></td></tr>'))).toBe(true);
  });
});

describe("median", () => {
  it("handles odd, even and empty samples", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
});
