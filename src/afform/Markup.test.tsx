import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithQuery } from "../test/render";
import { AfreactForm } from "./AfreactForm";
import { Field } from "./Field";
import { Markup, TokenContext, tokenText } from "./Markup";
import type { FieldDefn, FormData, LayoutNode } from "./types";

const data: FormData = {
  Individual1: [{ fields: { first_name: "Ada", gender_id: 2, tags: [1, 3], nick_name: null } }],
};

function field(defn: Partial<FieldDefn>, tokens: FormData | null = null) {
  const full = { name: "f", label: "F", input_type: "Text", data_type: "String", ...defn };
  return render(
    <TokenContext.Provider value={tokens}>
      <Field defn={full} value="" disabled={false} onChange={() => undefined} />
    </TokenContext.Provider>,
  );
}

describe("Markup", () => {
  it("renders a label's HTML and keeps it naming the input", () => {
    field({ label: "Your <b>first</b> name", required: true });
    const input = screen.getByRole("textbox", { name: "Your first name" });
    expect(screen.getByText("first").tagName).toBe("B");
    expect(input).toBeInTheDocument();
  });

  it("renders help texts as HTML and keeps the description", () => {
    field({ help_pre: "See <em>below</em>", help_post: 'Read <a href="/terms">the terms</a>' });
    expect(screen.getByText("below").tagName).toBe("EM");
    expect(screen.getByRole("link", { name: "the terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Read the terms");
  });

  it("drops script, handlers and unknown tags but keeps their text", () => {
    const { container } = render(
      <Markup
        html={
          '<i onclick="x()" class="c" style="color:red">a</i><script>alert(1)</script>' +
          '<font color="red">b</font><img src="/i.png" onerror="x()" alt="i">' +
          '<a href="javascript:alert(1)">c</a>'
        }
      />,
    );
    const italic = screen.getByText("a");
    expect(italic).toHaveAttribute("class", "c");
    expect(italic).not.toHaveAttribute("onclick");
    expect(italic).not.toHaveAttribute("style");
    expect(container.querySelector("script, font")).toBeNull();
    expect(container).toHaveTextContent(/^abc$/);
    expect(screen.getByRole("img", { name: "i" })).not.toHaveAttribute("onerror");
    expect(screen.getByText("c").getAttribute("href")).not.toMatch(/^javascript:alert/);
  });

  it("shows tokens in a label as the live field value inside af-form only", () => {
    const { unmount } = field({ label: "Hello [Individual1.0.first_name]" }, data);
    expect(screen.getByRole("textbox", { name: "Hello Ada" })).toBeInTheDocument();
    unmount();
    field({ label: "Hello [Individual1.0.first_name]" });
    expect(screen.getByRole("textbox", { name: "Hello [Individual1.0.first_name]" })).toBeVisible();
  });

  it("writes token values as afForm does, with an emptied field as nothing", () => {
    expect(tokenText("[Individual1.0.gender_id]", data)).toBe("2");
    expect(tokenText("[Individual1.0.tags]", data)).toBe("1,3");
    expect(tokenText("[Individual1.0.nick_name]", data)).toBe("");
    expect(tokenText("[Individual1.0.last_name]", data)).toBe("");
    expect(tokenText("[Organization1.0.name]", data)).toBe("");
  });
});

describe("tokens in a form", () => {
  const token = "[Individual1.0.first_name]";
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
              defn: { name: "first_name", label: "First", input_type: "Text", data_type: "String" },
            },
          ],
        },
        {
          "#tag": "div",
          class: "af-markup",
          "#children": [{ "#tag": "p", "#children": [{ "#text": `Hello ${token}!` }] }],
        },
        { "#tag": "p", "#children": [{ "#text": `Plain ${token}` }] },
      ],
    },
  ];

  it("show the live value in content blocks and leave other text alone", async () => {
    mockApi({
      "Afreact.getForm": () => [
        { name: "afformTest", title: "Test", type: "form", layout, strings: [] },
      ],
      "Afform.prefill": () => [],
    });
    renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash: "" }} />);
    const input = await screen.findByRole("textbox", { name: "First" });
    expect(screen.getByText("Hello !")).toBeInTheDocument();
    await userEvent.type(input, "Ada");
    expect(screen.getByText("Hello Ada!")).toBeInTheDocument();
    expect(screen.getByText(`Plain ${token}`)).toBeInTheDocument();
  });
});
