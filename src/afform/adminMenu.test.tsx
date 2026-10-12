import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithQuery } from "../test/render";
import { AfreactForm } from "./AfreactForm";
import { adminMenuLinks, isAdminMenu } from "./adminMenu";
import { htmlToLayout } from "./bundle";
import { layoutProblems } from "./support";
import { isElement, type ElementNode, type LayoutNode } from "./types";

/** AfformAdminInjector's markup, with a title escaped by htmlspecialchars. */
const item = (permission: string, createdId: string, url: string, icon: string, text: string) => `
  <li ng-if="checkLinkPerm('${permission}', ${createdId})">
    <a href="${url}" target="_blank">
      <i class="crm-i fa-fw ${icon}" role="img" aria-hidden="true"></i> ${text}
    </a>
  </li>`;
const markup = (items: string) => `
  <div class="btn-group crm-admin-block-context-dropdown dropup" ng-if="checkLinkPerm('manage own afform', 7)">
    <button type="button" class="btn dropdown-toggle btn-sm" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
      <i class="crm-i fa-gear" role="img" aria-hidden="true"></i> <span class="sr-only">{{:: ts('Configure')}}</span>
    </button>
    <ul class="dropdown-menu dropdown-menu-right">${items}</ul>
  </div>
`;
const LINKS =
  item(
    "manage own afform",
    "7",
    "/edit/afformX",
    "fa-pencil",
    "Edit <em>Tom &amp; {{1+1}}</em> in FormBuilder",
  ) +
  item("manage own afform", "7", "/submissions?name=afformX", "fa-list", "View Submissions") +
  item(
    "all CiviCRM permissions and ACLs",
    "null",
    "/search/edit/3",
    "fa-search-plus",
    "Edit <em>Locked</em> in SearchKit",
  );

const parse = (html: string): LayoutNode[] =>
  htmlToLayout(html, { types: {}, translate: (text) => text });
const menuOf = (html: string): ElementNode => {
  const menu = parse(html).find(isElement);
  if (!menu) throw new Error("No menu in the markup.");
  return menu;
};

function renderForm(layout: LayoutNode[]) {
  mockApi({
    "Afreact.getForm": () => [{ name: "afformX", title: "X", type: "form", layout, strings: [] }],
  });
  renderWithQuery(<AfreactForm name="afformX" location={{ search: "", hash: "" }} />);
}

describe("adminMenuLinks", () => {
  it("reads every link of afform_admin's markup in core's order", () => {
    const menu = menuOf(markup(LINKS));
    expect(isAdminMenu(menu)).toBe(true);
    expect(adminMenuLinks(menu)).toEqual([
      {
        url: "/edit/afformX",
        icon: "fa-fw fa-pencil",
        permission: "manage own afform",
        createdId: 7,
        label: [
          { text: "Edit ", emphasis: false },
          { text: "Tom & {{1+1}}", emphasis: true },
          { text: " in FormBuilder", emphasis: false },
        ],
      },
      {
        url: "/submissions?name=afformX",
        icon: "fa-fw fa-list",
        permission: "manage own afform",
        createdId: 7,
        label: [{ text: "View Submissions", emphasis: false }],
      },
      {
        url: "/search/edit/3",
        icon: "fa-fw fa-search-plus",
        permission: "all CiviCRM permissions and ACLs",
        createdId: null,
        label: [
          { text: "Edit ", emphasis: false },
          { text: "Locked", emphasis: true },
          { text: " in SearchKit", emphasis: false },
        ],
      },
    ]);
    expect(layoutProblems(parse(markup(LINKS)))).toEqual([]);
  });

  it("takes a link with another condition or markup as a shape it does not know", () => {
    const odd = item("manage own afform", "7", "/x", "fa-x", "<b>Bold</b>");
    expect(adminMenuLinks(menuOf(markup(odd)))).toBeNull();
    const condition = LINKS.replace("checkLinkPerm('manage own afform', 7)", "isAdmin()");
    expect(adminMenuLinks(menuOf(markup(condition)))).toBeNull();
    expect(adminMenuLinks(menuOf(markup("")))).toBeNull();
    expect(layoutProblems(parse(markup(odd)))).toEqual([
      "afform_admin's edit menu in a shape React does not know",
    ]);
  });
});

describe("AdminMenu", () => {
  // deviation:admin-menu-title-text
  it("shows the creator the form's links but not a locked search's", async () => {
    window.CRM.config = { cid: 7 };
    vi.mocked(window.CRM.checkPerm).mockImplementation((perm) => perm === "manage own afform");
    renderForm(parse(markup(LINKS)));
    await userEvent.click(await screen.findByRole("button", { name: "Configure" }));
    const links = screen.getAllByRole("menuitem", { hidden: true });
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "Edit Tom & {{1+1}} in FormBuilder",
      "View Submissions",
    ]);
    expect(links[0]).toHaveAttribute("href", "/edit/afformX");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(within(links[0]!).getByText("Tom & {{1+1}}").tagName).toBe("EM");
    delete window.CRM.config;
  });

  it("asks another user for the administer permission and hides the menu without it", async () => {
    window.CRM.config = { cid: 8 };
    vi.mocked(window.CRM.checkPerm).mockImplementation((perm) => perm === "manage own afform");
    renderForm([{ "#tag": "p", "#children": [{ "#text": "Body" }] }, ...parse(markup(LINKS))]);
    await screen.findByText("Body");
    expect(screen.queryByRole("button", { name: "Configure" })).toBeNull();
    delete window.CRM.config;
  });

  it("shows a super admin every link", async () => {
    window.CRM.config = { cid: 8 };
    vi.mocked(window.CRM.checkPerm).mockReturnValue(true);
    renderForm(parse(markup(LINKS)));
    await userEvent.click(await screen.findByRole("button", { name: "Configure" }));
    expect(screen.getAllByRole("menuitem", { hidden: true })).toHaveLength(3);
    delete window.CRM.config;
  });
});
