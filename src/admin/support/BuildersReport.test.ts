import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  BuildersReport,
  displayTypeSupport,
  formPartsLeft,
  parseFindings,
  parseFormFindings,
} from "./BuildersReport";

/** The FormBuilder report of `json`, which must not be the one of a site without FormBuilder. */
function formFindings(json: string) {
  const findings = parseFormFindings(json);
  if (!findings) throw new Error("No FormBuilder report.");
  return findings;
}

describe("builders report", () => {
  it("reads the findings, an empty map of display types encoded as a list included", () => {
    expect(
      parseFindings('{"displayTypes":[],"modules":["x"],"partials":[],"replaced":["crmX"]}'),
    ).toEqual({
      displayTypes: {},
      modules: ["x"],
      partials: [],
      replaced: ["crmX"],
    });
    expect(() => parseFindings('{"displayTypes":[],"modules":[],"partials":[]}')).toThrow(
      /replaced parts/,
    );
    expect(() => parseFindings('{"displayTypes":{"table":1},"modules":[],"partials":[]}')).toThrow(
      /display types/,
    );
    expect(() => parseFindings('{"displayTypes":{},"modules":"x","partials":[]}')).toThrow(
      /modules/,
    );
  });

  it("leaves to the classic builder only types without a React or Angular editor", () => {
    customElements.define(
      "afreact-search-admin-display-report-plugin",
      class extends HTMLElement {},
    );
    const { islands, classic } = displayTypeSupport({
      table: "Table",
      "chart-kit": "Chart",
      "report-plugin": "Plugin",
      "report-unknown": "Unknown",
    });
    expect(islands).toEqual([]);
    expect(classic).toEqual([["report-unknown", "Unknown"]]);
  });

  it("leaves to the classic builder only FormBuilder parts React neither builds nor has a plugin for", () => {
    customElements.define("afreact-afform-admin-report-note", class extends HTMLElement {});
    customElements.define("afreact-afform-admin-entity-report-thing", class extends HTMLElement {});
    const part = (name: string, template: string | null) => ({ name, label: name, template });
    const findings = formFindings(
      JSON.stringify({
        elements: [
          part("crm-recaptcha2", "~/afGuiRecaptcha2/afGuiRecaptcha2.html"),
          part("report-note", "~/report/note.html"),
          part("report-other", "~/report/other.html"),
        ],
        inputTypes: [
          part("Select", "~/afGuiEditor/inputType/Select.html"),
          part("ReportStars", "~/report/stars.html"),
        ],
        entities: [
          part("Group", "~/afGuiEditor/entityConfig/GroupSubscriptionOptions.html"),
          part("ReportThing", "~/report/thing.html"),
        ],
        behaviors: [
          part("autofill", "~/afGuiEditor/behaviors/autofillRelationshipBehavior.html"),
          part("report-greeting", "~/report/greeting.html"),
        ],
        modules: ["reportModule"],
        partials: [],
        replaced: [],
      }),
    );
    expect(formPartsLeft(findings)).toEqual([
      "Element: report-other (report-other)",
      "Input type: ReportStars (ReportStars)",
      "Behavior: report-greeting (report-greeting)",
    ]);
    expect(() => parseFormFindings('{"elements":[{"name":1}]}')).toThrow(/elements/);
  });

  it("lists what other extensions' builder panels replace apart from what the site changed", () => {
    const findings = parseFindings(
      '{"displayTypes":{},"modules":["crmX"],"partials":[],"replaced":["crmX","xChanges"]}',
    );
    const form = formFindings(
      '{"elements":[],"inputTypes":[],"entities":[],"behaviors":[],"modules":[],"partials":[],"replaced":[]}',
    );
    render(createElement(BuildersReport, { findings, form }));
    const lists = screen.getAllByRole("heading", {
      name: "Modules and template changes other extensions' builder panels replace",
    });
    expect(lists).toHaveLength(2);
    expect(lists[0]?.nextElementSibling).toHaveTextContent("crmXxChanges");
    expect(lists[1]?.nextElementSibling).toHaveTextContent("None");
  });

  it("says so where the site has no FormBuilder", () => {
    const findings = parseFindings('{"displayTypes":{},"modules":[],"partials":[],"replaced":[]}');
    render(createElement(BuildersReport, { findings, form: parseFormFindings("null") }));
    const section = screen.getByRole("region", { name: "FormBuilder" });
    expect(section).toHaveTextContent("FormBuilder is not enabled.");
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(5);
  });
});
