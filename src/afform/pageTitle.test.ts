import { vi } from "vitest";
import { jquerySelection } from "../test/jquery";
import { replacePageTitle, titleWithLabels } from "./pageTitle";

describe("titleWithLabels", () => {
  it("puts the filter labels before the title as afCore does", () => {
    expect(titleWithLabels("Contacts", ["Ada", "Berlin"])).toBe("Ada Berlin Contacts");
    expect(titleWithLabels("Contacts", [])).toBe("Contacts");
    expect(titleWithLabels("", ["Ada"])).toBe("Ada");
  });
});

describe("replacePageTitle", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.title = "";
  });

  it("rewrites the document title and the heading that shows it", () => {
    document.title = "Contacts | CiviCRM";
    document.body.innerHTML = `<h1 id="page">Contacts</h1><h1 id="other">News</h1>
      <div class="crm-container"><h1 id="inner">Contacts</h1></div><main id="form"></main>`;
    const form = document.getElementById("form")!;
    replacePageTitle(form, "Contacts", "Ada Contacts");
    expect(document.title).toBe("Ada Contacts | CiviCRM");
    expect(document.getElementById("page")).toHaveTextContent("Ada Contacts");
    expect(document.getElementById("other")).toHaveTextContent("News");
    expect(document.getElementById("inner")).toHaveTextContent("Contacts");
    // Marked, so the next change finds it whatever it shows.
    replacePageTitle(form, "Ada Contacts", "Contacts");
    expect(document.getElementById("page")).toHaveTextContent(/^Contacts$/);
  });

  it("sets the title of the popup the form sits in", () => {
    const dialog = vi.fn(() => popup);
    const popup = jquerySelection({ length: 1, dialog });
    vi.mocked(window.CRM.$).mockReturnValue(jquerySelection({ closest: () => popup }));
    document.title = "Page";
    replacePageTitle(document.createElement("div"), "Contacts", "Ada Contacts");
    expect(dialog).toHaveBeenCalledWith("option", "title", "Ada Contacts");
    expect(document.title).toBe("Page");
  });
});
