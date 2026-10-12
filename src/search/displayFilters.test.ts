import { evaluateDisplayFilters, parseDisplayFilters, routeKeys } from "./displayFilters";

describe("parseDisplayFilters", () => {
  it("reads the object literals core forms use", () => {
    const filters = parseDisplayFilters(
      "{job_type: routeParams.job_type, 'entity_table': \"civicrm_contact\", n: -2, on: true, x: null, contact_id: options.contact_id,}",
    );
    expect(filters).toEqual([
      ["job_type", { scope: "routeParams", key: "job_type" }],
      ["entity_table", { literal: "civicrm_contact" }],
      ["n", { literal: -2 }],
      ["on", { literal: true }],
      ["x", { literal: null }],
      ["contact_id", { scope: "options", key: "contact_id" }],
    ]);
    expect(routeKeys(filters)).toEqual(["job_type"]);
    expect(parseDisplayFilters(" { } ")).toEqual([]);
  });

  it("reads lists, nested literals, bracket names and AngularJS's string escapes", () => {
    expect(
      parseDisplayFilters(
        String.raw`{tags: [1, 'b',], o: {"k": [null]}, p: routeParams['a-b'], 'q\'s': 'x\\y\nz\u00e9'}`,
      ),
    ).toEqual([
      ["tags", { literal: [1, "b"] }],
      ["o", { literal: { k: [null] } }],
      ["p", { scope: "routeParams", key: "a-b" }],
      ["q's", { literal: "x\\y\nzé" }],
    ]);
  });

  it.each([
    "job_type: 1",
    "{a: b}",
    "{a: routeParams.x.y}",
    "{a: 1 + 2}",
    "{a: [routeParams.x]}",
    "{a: routeParams[x]}",
    "{a 1}",
    "{a: }",
    "{a: 1} extra",
  ])("rejects %s", (source) => {
    expect(() => parseDisplayFilters(source)).toThrow();
  });
});

describe("evaluateDisplayFilters", () => {
  it("leaves out names without a value, as Angular's undefined", () => {
    const filters = parseDisplayFilters(
      "{job_type: routeParams.job_type, a: routeParams.missing, cid: options.contact_id, t: 'x'}",
    );
    expect(
      evaluateDisplayFilters(filters, new URLSearchParams("job_type=import"), { contact_id: 5 }),
    ).toEqual({
      job_type: "import",
      cid: 5,
      t: "x",
    });
    expect(evaluateDisplayFilters(filters, new URLSearchParams(), undefined)).toEqual({ t: "x" });
  });
});
