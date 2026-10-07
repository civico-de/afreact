import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { jquerySelection } from "../test/jquery";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { AfreactForm } from "./AfreactForm";
import type { LayoutNode } from "./types";

const button = (ngClick: string | null, text: string, extra = {}): LayoutNode => ({
  "#tag": "button",
  class: "af-button btn btn-primary",
  ...(ngClick && { "ng-click": ngClick }),
  ...extra,
  "#children": [{ "#text": text }],
});

const layout: LayoutNode[] = [
  {
    "#tag": "af-form",
    ctrl: "afform",
    "#children": [
      { "#tag": "af-entity", type: "Contact", name: "Individual1" },
      {
        "#tag": "fieldset",
        "af-fieldset": "Individual1",
        "#children": [
          {
            "#tag": "af-field",
            name: "first_name",
            defn: {
              name: "first_name",
              label: "First Name",
              input_type: "Text",
              data_type: "String",
            },
          },
        ],
      },
      button("afform.submit()", "Save"),
      button("afform.submitDraft()", "Save Draft", { "crm-icon": "fa-floppy-o" }),
      button(null, "Reset", { type: "reset" }),
    ],
  },
];

const meta = {
  name: "afformTest",
  title: "Test form",
  redirect: null,
  autosave_draft: false,
  confirmation_type: "show_confirmation_message",
  confirmation_message: null,
};

const prefill = [{ name: "Individual1", values: [{ fields: { id: 5, first_name: "Ada" } }] }];
const values = (firstName: string) => ({
  Individual1: [{ fields: { id: 5, first_name: firstName }, joins: {} }],
});

function renderForm(
  handlers: Record<string, (params: Record<string, unknown>) => unknown>,
  { autosave = false, pageTitle = false } = {},
) {
  const calls = mockApi({
    "Afreact.getForm": () => [
      {
        name: "afformTest",
        title: "Test form",
        type: "form",
        autosave_draft: autosave,
        meta,
        layout,
        strings: [],
      },
    ],
    "Afform.prefill": () => prefill,
    "Afform.submit": () => [{}],
    ...handlers,
  });
  renderWithQuery(
    <AfreactForm
      name="afformTest"
      location={{ search: "?Individual1=5", hash: "" }}
      pageTitle={pageTitle}
    />,
  );
  return calls;
}

const firstName = () => screen.findByRole("textbox", { name: "First Name" });
const called = <T extends { call: string }>(calls: T[], call: string) =>
  calls.filter((c) => c.call === call);

describe("submitting", () => {
  it("shows the box CRM.status keeps while saving, resolved by the response", async () => {
    const box = { resolve: vi.fn(), reject: vi.fn() };
    vi.mocked(window.CRM.status).mockReturnValue(box);
    renderForm({});
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(box.resolve).toHaveBeenCalled();
    });
    expect(window.CRM.status).toHaveBeenCalledWith({ error: "Not Saved" });
    expect(box.reject).not.toHaveBeenCalled();
  });

  it("gives the confirmation message the focus of the button it replaces", async () => {
    renderForm({ "Afform.submit": () => [{ message: "<p>Thanks</p>" }] });
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText("Thanks")).toBeInTheDocument();
    expect(document.querySelector(".afform-confirmation")).toHaveFocus();
  });

  describe("an error the server returns", () => {
    it("is a warning, in a summary that takes focus and lists each message", async () => {
      const box = { resolve: vi.fn(), reject: vi.fn() };
      vi.mocked(window.CRM.status).mockReturnValue(box);
      const trigger = vi.fn(() => selection);
      const selection = jquerySelection({ trigger });
      vi.mocked(window.CRM.$).mockReturnValue(selection);
      renderForm({
        "Afform.submit": () => {
          throw apiError("First Name is required.\n<b>Email</b> is invalid.");
        },
      });
      await userEvent.click(await screen.findByRole("button", { name: "Save" }));
      const summary = await screen.findByRole("alert");
      expect(summary).toHaveFocus();
      expect([...summary.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
        "First Name is required.",
        "<b>Email</b> is invalid.",
      ]);
      expect(window.CRM.alert).toHaveBeenCalledWith(
        "First Name is required.\n&lt;b&gt;Email&lt;/b&gt; is invalid.",
        "Please resolve these issues",
        "warning",
      );
      expect(box.reject).toHaveBeenCalled();
      expect(trigger).toHaveBeenCalledWith(
        "crmFormError",
        expect.objectContaining({
          afform: meta,
          data: values("Ada"),
          submissionResponse: undefined,
        }),
      );
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });

    it("is a problem when the server failed rather than rejected the values", async () => {
      renderForm({
        "Afform.submit": () => {
          throw Object.assign(apiError("DB Error"), { error_code: "1" });
        },
      });
      await userEvent.click(await screen.findByRole("button", { name: "Save" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("DB Error");
      expect(window.CRM.alert).toHaveBeenCalledWith("DB Error", "There is a problem", "error");
    });
  });

  it("alerts an invalid value on CiviCRM screens, where afForm does", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    container.id = "crm-notification-container";
    renderForm({});
    await userEvent.clear(await firstName());
    await userEvent.type(await firstName(), "x");
    const input = await firstName();
    if (input instanceof HTMLInputElement) input.setCustomValidity("<bad>");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(window.CRM.alert).toHaveBeenCalledWith(
      "Please check all answers are valid.",
      "Form Error",
    );
    container.remove();
  });
});

describe("the prefill", () => {
  it("lands over a form that shows at once and is busy until then", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = renderForm({ "Afform.prefill": () => held.then(() => prefill) });
    const input = await firstName();
    const form = input.closest(".afreact-form");
    expect(form).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(input).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    await userEvent.type(input, "B");
    release?.();
    await waitFor(() => {
      expect(form).toHaveAttribute("aria-busy", "false");
    });
    // The loaded record wins over what was typed meanwhile, as afForm's merge does.
    expect(input).toHaveValue("Ada");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    expect(called(calls, "Afform.prefill")).toHaveLength(1);
  });
});

describe("a form closed for submissions", () => {
  it("is disabled, says why inline and alerts it as afForm does", async () => {
    const calls = renderForm({
      "Afform.prefill": () => {
        throw apiError("This form is not currently open for submissions.");
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This form is not currently open for submissions.",
    );
    expect(await firstName()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(document.querySelector("af-form")).toHaveClass("disabled");
    expect(window.CRM.alert).toHaveBeenCalledWith(
      "This form is not currently open for submissions.",
      "Sorry",
      "error",
    );
    expect(called(calls, "Afform.submit")).toEqual([]);
  });
});

describe("the reset button", () => {
  it("prefills the form afresh", async () => {
    const calls = renderForm({});
    await userEvent.clear(await firstName());
    await userEvent.type(await firstName(), "Bea");
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(async () => expect(await firstName()).toHaveValue("Ada"));
    expect(called(calls, "Afform.prefill")).toHaveLength(2);
    expect(called(calls, "Afform.submit")).toEqual([]);
  });
});

describe("the page title", () => {
  const search: LayoutNode[] = [
    {
      "#tag": "div",
      "af-fieldset": "",
      "#children": [
        {
          "#tag": "crm-search-display-table",
          "search-name": "S",
          "display-name": "D",
          settings: {
            columns: [{ type: "field", key: "id", label: "ID" }],
            limit: 0,
            pager: false,
          },
        },
      ],
    },
  ];

  function renderSearch(pageTitle: boolean, labels: string[]) {
    document.body.innerHTML = `<h1 id="title">Search</h1>`;
    document.title = "Search | CiviCRM";
    mockApi({
      "Afreact.getForm": () => [
        { name: "afsearchTest", title: "Search", type: "search", layout: search, strings: [] },
      ],
      "SearchDisplay.run": () => Object.assign([{ key: 1, columns: [{ val: 1 }] }], { labels }),
    });
    renderWithQuery(
      <AfreactForm name="afsearchTest" location={{ search: "", hash: "" }} pageTitle={pageTitle} />,
    );
  }

  afterEach(() => {
    document.title = "";
  });

  it("starts with the labels of the display's filters on the form's page", async () => {
    renderSearch(true, ["Ada"]);
    await waitFor(() => expect(document.getElementById("title")).toHaveTextContent("Ada Search"));
    expect(document.title).toBe("Ada Search | CiviCRM");
  });

  it("stays as it is where the form is placed in another page", async () => {
    renderSearch(false, ["Ada"]);
    expect(await screen.findByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(document.getElementById("title")).toHaveTextContent(/^Search$/);
  });
});

describe("drafts", () => {
  afterEach(() => {
    delete window.CRM.config;
    vi.useRealTimers();
  });

  it("are saved on request once the form holds changes", async () => {
    const box = { resolve: vi.fn(), reject: vi.fn() };
    vi.mocked(window.CRM.status).mockReturnValue(box);
    const calls = renderForm({ "Afform.submitDraft": () => [{}] });
    const draft = await screen.findByRole("button", { name: "Save Draft" });
    expect(draft).toBeDisabled();
    await userEvent.type(await firstName(), "!");
    expect(draft).toBeEnabled();
    await userEvent.click(draft);
    expect(await screen.findByRole("button", { name: "Draft Saved" })).toBeDisabled();
    expect(called(calls, "Afform.submitDraft")[0]?.params).toEqual({
      name: "afformTest",
      args: { Individual1: ["5"] },
      values: values("Ada!"),
    });
    expect(window.CRM.status).toHaveBeenCalledWith({
      start: "Saving Draft",
      success: "Draft Saved",
      error: "Not Saved",
    });
    expect(box.resolve).toHaveBeenCalled();
    await userEvent.type(await firstName(), "?");
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled();
  });

  it("report a draft the server refused", async () => {
    renderForm({
      "Afform.submitDraft": () => {
        throw apiError("Drafts are not allowed.");
      },
    });
    await userEvent.type(await firstName(), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Drafts are not allowed.");
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled();
  });

  it("save themselves ten seconds after a change for a known user", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.CRM.config = { cid: 7 };
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderForm({ "Afform.submitDraft": () => [{}] }, { autosave: true });
    await user.type(await firstName(), "!");
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(called(calls, "Afform.submitDraft")).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    await waitFor(() => {
      expect(called(calls, "Afform.submitDraft")).toHaveLength(1);
    });
    expect(await screen.findByRole("button", { name: "Draft Saved" })).toBeInTheDocument();
  });

  it("saved in the background report a failure without the focus, and wait for a change", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.CRM.config = { cid: 7 };
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderForm(
      {
        "Afform.submitDraft": () => {
          throw apiError("Drafts are not allowed.");
        },
      },
      { autosave: true },
    );
    await user.type(await firstName(), "!");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Drafts are not allowed.");
    expect(window.CRM.alert).toHaveBeenCalledWith(
      "Drafts are not allowed.",
      "Please resolve these issues",
      "warning",
    );
    expect(await firstName()).toHaveFocus();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(called(calls, "Afform.submitDraft")).toHaveLength(1);

    await user.type(await firstName(), "?");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    await waitFor(() => {
      expect(called(calls, "Afform.submitDraft")).toHaveLength(2);
    });
  });

  it("wait for the user to save them without a known user or token", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const calls = renderForm({ "Afform.submitDraft": () => [{}] }, { autosave: true });
    await user.type(await firstName(), "!");
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(called(calls, "Afform.submitDraft")).toEqual([]);
  });
});
