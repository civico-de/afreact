import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { mockApi, renderWithQuery } from "../../test/render";
import { AfreactForm } from "../AfreactForm";
import type { FieldDefn, LayoutNode } from "../types";
import type { CheckoutSettings } from "./CheckoutBlock";

const field = (
  name: string,
  defn: Partial<FieldDefn>,
  extra: Partial<LayoutNode> = {},
): LayoutNode => ({
  "#tag": "af-field",
  name,
  defn: { name, label: name, input_type: "Text", data_type: "String", ...defn },
  ...extra,
});

const option = field("checkout_option", {
  label: "Payment",
  input_type: "Select",
  options: [
    { id: "pay_later", label: "Pay later" },
    { id: "card", label: "Card" },
  ],
});
const block = (label: string | false = "Checkout Details") =>
  field("checkout_params", { label, input_type: "CheckoutBlock", data_type: "String" });

const settings: CheckoutSettings = {
  testMode: false,
  checkoutOptions: {
    pay_later: { description: "No payment will be taken now." },
    card: {
      label: "Card",
      fields: [
        { name: "credit_card_number", title: "Card Number", htmlType: "text", is_required: true },
        {
          name: "credit_card_type",
          title: "Card Type",
          htmlType: "select",
          options: [
            { id: "Visa", label: "Visa" },
            { id: "MasterCard", label: "MasterCard" },
          ],
        },
        { name: "credit_card_exp_date", title: "Expiration Date", htmlType: "expiryDate" },
        {
          name: "billing_country_id-5",
          title: "Country",
          htmlType: "select",
          options: [
            { id: "", label: "- select -" },
            { id: "1228", label: "United States" },
            { id: "1039", label: "Canada" },
          ],
        },
        { name: "billing_state_province_id-5", title: "State", htmlType: "chainSelect" },
        { name: "save_card", title: "Save card", htmlType: "checkBox" },
      ],
    },
  },
};

const submit: LayoutNode = {
  "#tag": "button",
  "ng-click": "afform.submit()",
  "#children": [{ "#text": "Submit" }],
};

function renderForm(
  children: LayoutNode[],
  data?: Record<string, unknown>,
  prefill: Record<string, unknown> = {},
) {
  const layout: LayoutNode[] = [
    {
      "#tag": "af-form",
      ctrl: "afform",
      "#children": [
        { "#tag": "af-entity", type: "Contribution", name: "Contribution1", data },
        { "#tag": "div", "af-fieldset": "Contribution1", "#children": children },
        submit,
      ],
    },
  ];
  const calls = mockApi({
    "Afreact.getForm": () => [
      { name: "afformTest", title: "Test", type: "form", layout, strings: [] },
    ],
    "Afform.prefill": () => [{ name: "Contribution1", values: [{ fields: prefill, joins: {} }] }],
    "Afform.submit": () => [{}],
    "Afform.submitDraft": () => [{}],
    "StateProvince.get": ({ where }) =>
      JSON.stringify(where) === JSON.stringify([["country_id", "=", "1228"]])
        ? [
            { id: 1004, name: "California" },
            { id: 1031, name: "New York" },
          ]
        : [],
  });
  renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash: "" }} />);
  return calls;
}

const submitted = (calls: ReturnType<typeof mockApi>) =>
  calls.filter(({ call }) => call === "Afform.submit").at(-1)?.params.values;

afterEach(() => {
  delete window.CRM.vars;
});

describe("CheckoutBlock", () => {
  it("shows the fixed option's description from the entity data, without a label", async () => {
    window.CRM.vars = { afreact: { afCheckout: settings } };
    renderForm([block(false)], { checkout_option: "pay_later" });
    expect(await screen.findByText("No payment will be taken now.")).toBeInTheDocument();
    expect(screen.queryByText("Checkout Details")).not.toBeInTheDocument();
    expect(screen.queryByText("Checkout is in Test Mode.")).not.toBeInTheDocument();
  });

  // deviation:checkout-params-not-in-drafts
  it("starts with empty details, as afCheckoutBlock does, and keeps them out of drafts", async () => {
    window.CRM.vars = { afreact: { afCheckout: settings } };
    vi.mocked(window.CRM.status).mockReturnValue({ resolve: vi.fn(), reject: vi.fn() });
    const calls = renderForm(
      [
        option,
        block(),
        {
          "#tag": "button",
          "ng-click": "afform.submitDraft()",
          "#children": [{ "#text": "Save Draft" }],
        },
      ],
      undefined,
      { checkout_option: "card", checkout_params: { credit_card_number: "4111" } },
    );
    const number = await screen.findByRole("textbox", { name: "Card Number" });
    expect(number).toHaveValue("");
    await userEvent.type(number, "5500 ");
    const draft = screen.getByRole("button", { name: "Save Draft" });
    await userEvent.click(draft);
    await waitFor(() => {
      expect(calls.find(({ call }) => call === "Afform.submitDraft")?.params.values).toEqual({
        Contribution1: [{ fields: { checkout_option: "card" }, joins: {} }],
      });
    });
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Contribution1: [
          {
            fields: { checkout_option: "card", checkout_params: { credit_card_number: "5500" } },
            joins: {},
          },
        ],
      });
    });
  });

  // deviation:billing-state-follows-country
  it("drops a required text emptied again and the state once the country changes", async () => {
    window.CRM.vars = { afreact: { afCheckout: settings } };
    const calls = renderForm([block()], { checkout_option: "card" });
    const number = await screen.findByRole("textbox", { name: "Card Number" });
    await userEvent.type(number, "4111");
    await userEvent.clear(number);
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Country" }),
      "United States",
    );
    const state = screen.getByRole("combobox", { name: "State" });
    await userEvent.selectOptions(
      state,
      await within(state).findByRole("option", { name: "California" }),
    );
    expect(state).toHaveValue("1004");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Country" }), "Canada");
    expect(state).toHaveValue("");
    expect(within(state).getByRole("option", { name: "- select -" })).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Expiration month" }), "12");
    // The required card number keeps the browser from submitting.
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(number).toBeInvalid();
    await userEvent.type(number, "4111");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Contribution1: [
          {
            fields: {
              checkout_option: "card",
              checkout_params: {
                credit_card_number: "4111",
                expiry_month: "12",
                "billing_country_id-5": "1039",
              },
            },
            joins: {},
          },
        ],
      });
    });
  });

  // deviation:billing-state-follows-country
  it("takes fields keyed by name and frees a required state once the country has none", async () => {
    window.CRM.vars = {
      afreact: {
        afCheckout: {
          testMode: false,
          checkoutOptions: {
            card: {
              fields: {
                "billing_country_id-5": {
                  name: "billing_country_id-5",
                  title: "Country",
                  htmlType: "select",
                  options: [
                    { id: "", label: "- select -" },
                    { id: "1039", label: "Canada" },
                    { id: "1101", label: "Iceland" },
                  ],
                },
                "billing_state_province_id-5": {
                  name: "billing_state_province_id-5",
                  title: "State",
                  htmlType: "chainSelect",
                  is_required: true,
                },
              },
            },
          },
        },
      },
    };
    const calls = renderForm([block()], { checkout_option: "card" });
    const country = await screen.findByRole("combobox", { name: "Country" });
    // The options' own blank entry, not a second one.
    expect(within(country).getAllByRole("option")).toHaveLength(3);
    const state = screen.getByRole("combobox", { name: "State" });
    expect(state).toBeRequired();
    await userEvent.selectOptions(country, "Iceland");
    await within(state).findByRole("option", { name: "- select -" });
    expect(state).not.toBeRequired();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Contribution1: [
          {
            fields: {
              checkout_option: "card",
              checkout_params: { "billing_country_id-5": "1101" },
            },
            joins: {},
          },
        ],
      });
    });
  });

  it("says when the page carries no checkout settings", async () => {
    renderForm([block()], { checkout_option: "pay_later" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The page provides no checkout options.",
    );
  });

  // deviation:checkout-labels-tied
  it("follows the option field: its fields write checkout_params, a switch empties them", async () => {
    window.CRM.vars = { afreact: { afCheckout: { ...settings, testMode: true } } };
    const calls = renderForm([option, block()]);
    const group = await screen.findByRole("group", { name: "Checkout Details" });
    // The warning shows before any option is chosen, as in afCheckoutBlock.
    expect(within(group).getByRole("status")).toHaveTextContent("Checkout is in Test Mode.");
    expect(group.querySelector("input, select")).toBeNull();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Payment" }), "Card");
    const number = within(group).getByRole("textbox", { name: "Card Number" });
    expect(number).toBeRequired();
    expect(number.closest(".af-checkout-field_credit_card_number")).toHaveClass("form-group");
    await userEvent.type(number, "4111");
    await userEvent.selectOptions(
      within(group).getByRole("combobox", { name: "Card Type" }),
      "Visa",
    );
    await userEvent.type(within(group).getByRole("textbox", { name: "Expiration month" }), "12");
    await userEvent.type(within(group).getByRole("textbox", { name: "Expiration year" }), "29");
    await userEvent.click(within(group).getByRole("checkbox", { name: "Save card" }));

    const state = within(group).getByRole("combobox", { name: "State" });
    expect(
      within(state).getByRole("option", { name: "- select country first -" }),
    ).toBeInTheDocument();
    expect(calls.filter(({ call }) => call === "StateProvince.get")).toEqual([]);
    await userEvent.selectOptions(
      within(group).getByRole("combobox", { name: "Country" }),
      "United States",
    );
    await userEvent.selectOptions(
      state,
      await within(state).findByRole("option", { name: "New York" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Contribution1: [
          {
            fields: {
              checkout_option: "card",
              checkout_params: {
                credit_card_number: "4111",
                credit_card_type: "Visa",
                expiry_month: "12",
                expiry_year: "29",
                save_card: true,
                "billing_country_id-5": "1228",
                "billing_state_province_id-5": "1031",
              },
            },
            joins: {},
          },
        ],
      });
    });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Payment" }), "Pay later");
    expect(within(group).getByText("No payment will be taken now.")).toBeInTheDocument();
    expect(within(group).queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Contribution1: [
          { fields: { checkout_option: "pay_later", checkout_params: {} }, joins: {} },
        ],
      });
    });
  });

  it("names an option's Angular template and a checkout field it cannot show", async () => {
    window.CRM.vars = {
      afreact: {
        afCheckout: {
          testMode: false,
          checkoutOptions: {
            pay_later: {
              label: "Stripe",
              template: "~/afStripe/stripe.html",
              fields: [{ name: "token", title: "Token", htmlType: "hidden" }],
            },
          },
        },
      },
    };
    renderForm([block()], { checkout_option: "pay_later" });
    const notes = await screen.findAllByRole("note");
    expect(notes.map((note) => note.textContent)).toEqual([
      "Not supported by the React renderer: checkout template ~/afStripe/stripe.html (Stripe)",
      "Not supported by the React renderer: checkout field token (Token)",
    ]);
  });
});
