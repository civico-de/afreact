import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { loadAngular } from "../../angular/island";
import { debugEntries, switchDebug } from "../../debug/debug";
import { installAngular, scriptFor, type FakeTemplate } from "../../test/angular";
import { mockApi, renderWithQuery } from "../../test/render";
import { AfreactForm } from "../AfreactForm";
import type { FieldDefn, LayoutNode } from "../types";
import type { CheckoutField, CheckoutSettings } from "./CheckoutBlock";

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
  handlers: Parameters<typeof mockApi>[0] = {},
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
    ...handlers,
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

  // deviation:checkout-value-as-saved
  it("follows the entity's fixed option over the option field, as the submit does", async () => {
    window.CRM.vars = { afreact: { afCheckout: settings } };
    renderForm([option, block()], { checkout_option: "pay_later" });
    expect(await screen.findByText("No payment will be taken now.")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Payment" }), "Card");
    expect(screen.getByText("No payment will be taken now.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Card Number" })).not.toBeInTheDocument();
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
        extra: { fields: {} },
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
        extra: { fields: {} },
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
        extra: { fields: {} },
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
        extra: { fields: {} },
      });
    });
  });

  // deviation:invalid-fields-listed
  it("lists an invalid expiry input of a blocked submit by its own name", async () => {
    window.CRM.vars = { afreact: { afCheckout: settings } };
    renderForm([block()], { checkout_option: "card" });
    await userEvent.type(await screen.findByRole("textbox", { name: "Expiration year" }), "2");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    const entries = within(await screen.findByRole("alert")).getAllByRole("button");
    expect(entries.map((entry) => entry.textContent)).toEqual(["Card Number", "Expiration year"]);
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
        extra: { fields: {} },
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
        extra: { fields: {} },
      });
    });
  });

  it("names a checkout field it cannot show", async () => {
    window.CRM.vars = {
      afreact: {
        afCheckout: {
          testMode: false,
          checkoutOptions: {
            pay_later: {
              label: "Token",
              fields: [{ name: "token", title: "Token", htmlType: "hidden" }],
            },
          },
        },
      },
    };
    renderForm([block()], { checkout_option: "pay_later" });
    const notes = await screen.findAllByRole("note");
    expect(notes.map((note) => note.textContent)).toEqual([
      "Not supported by the React renderer: checkout field token (Token)",
    ]);
  });

  it("says so when the page lists no assets for an option's template", async () => {
    window.CRM.vars = {
      afreact: {
        afCheckout: {
          testMode: false,
          checkoutOptions: { pay_later: { label: "Stripe", template: "~/afStripe/stripe.html" } },
        },
      },
    };
    renderForm([block()], { checkout_option: "pay_later" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The page lists no Angular assets for the template of pay_later.",
    );
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    expect(document.querySelector(".afreact-status")).toHaveTextContent(
      "Stripe could not load, so the form cannot be submitted.",
    );
  });
});

interface Block {
  checkout_params: Record<string, unknown>;
  afForm: unknown;
  getContributionValue: (key: string) => unknown;
  getCheckoutOptionKey: () => unknown;
  getCheckoutOption: () => unknown;
  getCheckoutIsTestMode: () => unknown;
  getCheckoutOptionLabel: () => unknown;
  getCheckoutOptionDescription: () => unknown;
  getCheckoutOptionTemplate: () => unknown;
  getCheckoutOptionFields: () => unknown;
  exportParamValues: () => void;
}

interface Form {
  submit: () => void;
  ngForm: { $valid: boolean; $invalid: boolean };
}

const isBlock = (value: unknown): value is Block =>
  typeof value === "object" && value !== null && "exportParamValues" in value;
const isForm = (value: unknown): value is Form =>
  typeof value === "object" && value !== null && "ngForm" in value;

function blockOf(value: unknown): Block {
  if (!isBlock(value)) throw new Error("No afCheckoutBlock controller.");
  return value;
}

function formOf(value: unknown): Form {
  if (!isForm(value)) throw new Error("No afForm controller.");
  return value;
}

function control<T extends Element>(root: Element, selector: string, type: new () => T): T {
  const found = root.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`No ${selector}.`);
  return found;
}

describe("CheckoutBlock with an option's Angular template", () => {
  let fake: ReturnType<typeof installAngular>;
  const destroyed: { template: string; inForm: boolean }[] = [];

  // As a processor's partial included by afCheckoutBlock: it reads $ctrl from its scope.
  const card: FakeTemplate = (element, scope) => {
    const ctrl = blockOf(Reflect.get(scope, "$ctrl"));
    const ts: unknown = Reflect.get(scope, "ts");
    element.innerHTML = `<label for="island-number">Card Number</label>
      <input id="island-number" ng-model="$ctrl.checkout_params.number" required>
      <output id="island-facts"></output><output id="island-saved"></output>
      <output id="island-params"></output>`;
    const number = control(element, "input", HTMLInputElement);
    number.addEventListener("input", () => {
      scope.$apply(() => {
        ctrl.checkout_params.number = number.value;
      });
    });
    const facts = () =>
      JSON.stringify({
        key: ctrl.getCheckoutOptionKey(),
        option: ctrl.getCheckoutOption(),
        label: ctrl.getCheckoutOptionLabel(),
        description: ctrl.getCheckoutOptionDescription(),
        template: ctrl.getCheckoutOptionTemplate(),
        fields: ctrl.getCheckoutOptionFields(),
        testMode: ctrl.getCheckoutIsTestMode(),
        source: ctrl.getContributionValue("source"),
        currency: ctrl.getContributionValue("currency"),
        amount: ctrl.getContributionValue("total_amount"),
        campaign: ctrl.getContributionValue("campaign_id"),
        afForm: ctrl.afForm === fake.controller(element, "afForm"),
        ts: typeof ts,
      });
    scope.$watch(facts, (json) => {
      control(element, "#island-facts", HTMLOutputElement).textContent = String(json);
    });
    scope.$watch(
      () => ctrl.checkout_params.save_card,
      (saved) => {
        control(element, "#island-saved", HTMLOutputElement).textContent = String(saved);
      },
    );
    scope.$watch(
      () => ctrl.checkout_params,
      (params) => {
        control(element, "#island-params", HTMLOutputElement).textContent = JSON.stringify(params);
      },
      true,
    );
    scope.$on("$destroy", () => {
      destroyed.push({ template: "card", inForm: element.closest("af-form") !== null });
    });
  };

  // As a processor's component: it requires both controllers from its ancestors.
  const wallet: FakeTemplate = (element, scope) => {
    const ctrl = blockOf(fake.controller(element, "afCheckoutBlock"));
    const form = formOf(fake.controller(element, "afForm"));
    element.innerHTML = `<button type="button">Pay with wallet</button><output></output>`;
    const pay = control(element, "button", HTMLButtonElement);
    scope.$watch(
      () => form.ngForm.$valid,
      (valid) => {
        pay.disabled = valid !== true;
        control(element, "output", HTMLOutputElement).textContent = form.ngForm.$invalid
          ? "invalid"
          : "valid";
      },
    );
    // A wallet's callback: no digest runs between the details and the submit.
    pay.addEventListener("click", () => {
      ctrl.checkout_params.source_type = "wallet";
      ctrl.exportParamValues();
      form.submit();
    });
    scope.$on("$destroy", () => {
      destroyed.push({ template: "wallet", inForm: element.closest("af-form") !== null });
    });
  };

  const templates = { "~/afreactTest/card.html": card, "~/afreactTest/wallet.html": wallet };
  const modules = ["afCore", "afCheckout", "afreactTest"];

  const islandSettings = (scripts = ["/island.js"], extra: string[] = []): CheckoutSettings => ({
    testMode: true,
    checkoutOptions: {
      pay_later: { description: "No payment will be taken now." },
      card: {
        label: "Card",
        description: "Pay by card.",
        template: "~/afreactTest/card.html",
        fields: [{ name: "save_card", title: "Save card", htmlType: "checkBox" }],
      },
      wallet: { label: "Wallet", template: "~/afreactTest/wallet.html" },
      missing: { label: "Missing", template: "~/afreactTest/missing.html" },
    },
    islands: {
      modules: [...modules, ...extra],
      options: {
        card: { label: "Card", module: "afreactTest" },
        wallet: { label: "Wallet", module: "afreactTest" },
        missing: { label: "Missing", module: null },
      },
      assets: {
        scripts,
        styles: [],
        settings: {
          angular: { modules: [...modules, ...extra], requires: {}, bundleUrl: "/island.json" },
        },
      },
    },
  });

  const choice = field("checkout_option", {
    label: "Payment",
    input_type: "Select",
    options: [
      { id: "pay_later", label: "Pay later" },
      { id: "card", label: "Card" },
      { id: "wallet", label: "Wallet" },
    ],
  });
  const source = field("source", { label: "Source", required: true });

  beforeEach(() => {
    destroyed.length = 0;
    fake = installAngular(templates);
    fake.define("afCore");
    fake.define("afCheckout", ["crmResource"]);
    fake.define("afreactTest", ["afCore", "afCheckout"]);
  });
  afterEach(() => {
    fake.uninstall();
    switchDebug(false);
  });

  // deviation:checkout-value-as-saved
  it("gives the template the block's controller, read live from the form", async () => {
    window.CRM.vars = { afreact: { afCheckout: islandSettings() } };
    vi.mocked(window.CRM.checkPerm).mockImplementation((perm) => perm === "view debug output");
    switchDebug(true);
    const amount = field("total_amount", { label: "Amount", input_type: "Number" });
    renderForm([source, amount, block()], {
      checkout_option: "card",
      source: "Entity",
      currency: "EUR",
    });
    const facts = await screen.findByText(/"key":"card"/);
    const read = () => JSON.parse(facts.textContent) as unknown;
    expect(read()).toEqual({
      key: "card",
      option: islandSettings().checkoutOptions.card,
      label: "Card",
      description: "Pay by card.",
      template: "~/afreactTest/card.html",
      fields: [{ name: "save_card", title: "Save card", htmlType: "checkBox" }],
      testMode: true,
      source: "Entity",
      currency: "EUR",
      amount: null,
      campaign: null,
      afForm: true,
      ts: "function",
    });
    // As the submit saves them: the entity's fixed data over the field, a 0 as typed.
    await userEvent.type(screen.getByRole("textbox", { name: "Source" }), "Typed");
    await userEvent.type(screen.getByRole("spinbutton", { name: "Amount" }), "0");
    await waitFor(() => {
      expect(read()).toMatchObject({ source: "Entity", amount: 0 });
    });
    // The island booted with its own bundle, and the page's stays.
    expect(fake.bundleUrls).toEqual(["/island.json"]);
    expect(window.CRM.angular?.bundleUrl).toBe("/page.json");
    expect(debugEntries().map((entry) => entry.facts["Angular islands"])).toContainEqual([
      "~/afreactTest/card.html (afreactTest)",
    ]);
  });

  it("sends the template's details with the submit, and React's own fields into the template", async () => {
    window.CRM.vars = { afreact: { afCheckout: islandSettings() } };
    const calls = renderForm([block()], { checkout_option: "card" });
    const number = await screen.findByRole("textbox", { name: "Card Number" });
    await userEvent.click(screen.getByRole("checkbox", { name: "Save card" }));
    expect(await screen.findByText("true")).toBeInTheDocument();
    await userEvent.type(number, "4111");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Contribution1: [
          {
            fields: {
              checkout_option: "card",
              checkout_params: { save_card: true, number: "4111" },
            },
            joins: {},
          },
        ],
        extra: { fields: {} },
      });
    });
  });

  it("shares one details object with the template, which loses what React drops", async () => {
    const withHolder = islandSettings();
    const holder: CheckoutField = {
      name: "holder",
      title: "Card holder",
      htmlType: "text",
      is_required: true,
    };
    withHolder.checkoutOptions.card = { ...withHolder.checkoutOptions.card, fields: [holder] };
    window.CRM.vars = { afreact: { afCheckout: withHolder } };
    const calls = renderForm([block()], { checkout_option: "card" });
    const number = await screen.findByRole("textbox", { name: "Card Number" });
    const seen = (): unknown =>
      JSON.parse(control(document.body, "#island-params", HTMLOutputElement).value);
    await userEvent.type(number, "41");
    const name = screen.getByRole("textbox", { name: "Card holder" });
    await userEvent.type(name, "Ada");
    await waitFor(() => {
      expect(seen()).toEqual({ number: "41", holder: "Ada" });
    });
    // React drops a required text emptied again, and the template's object with it.
    await userEvent.clear(name);
    await waitFor(() => {
      expect(seen()).toEqual({ number: "41" });
    });
    await userEvent.type(name, "Bo");
    await userEvent.type(number, "11");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Contribution1: [
          {
            fields: { checkout_option: "card", checkout_params: { number: "4111", holder: "Bo" } },
            joins: {},
          },
        ],
        extra: { fields: {} },
      });
    });
  });

  it("holds the submit while an Angular validator rejects a control", async () => {
    window.CRM.vars = { afreact: { afCheckout: islandSettings() } };
    const calls = renderForm([block()], { checkout_option: "card" });
    const number = await screen.findByRole("textbox", { name: "Card Number" });
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Please fill all required fields.")).toBeInTheDocument();
    // As ng-pattern would: the model is invalid while the browser sees a value.
    Object.assign(fake.modelOf(number), { $invalid: true, $error: { pattern: true } });
    await userEvent.type(number, "4111");
    expect(number).toHaveProperty("validationMessage", "Please enter a valid value.");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Please check all answers are valid.")).toBeInTheDocument();
    expect(submitted(calls)).toBeUndefined();
    Object.assign(fake.modelOf(number), { $invalid: false, $error: {} });
    await userEvent.type(number, "1");
    expect(number).toBeValid();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toBeDefined();
    });
  });

  // deviation:checkout-submit-once
  it("lets a template submit with its details once the form is valid, and only once", async () => {
    window.CRM.vars = { afreact: { afCheckout: islandSettings() } };
    const calls = renderForm([source, block()], { checkout_option: "wallet" });
    const pay = await screen.findByRole("button", { name: "Pay with wallet" });
    // The form's validity, without the errors a submit would show.
    expect(pay).toBeDisabled();
    expect(screen.getByText("invalid")).toBeInTheDocument();
    expect(screen.queryByText("Please fill all required fields.")).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Source" }), "Wallet page");
    await waitFor(() => {
      expect(pay).toBeEnabled();
    });
    vi.mocked(window.CRM.api4).mockImplementationOnce(
      () =>
        new Promise(() => {
          // Never answers.
        }),
    );
    await userEvent.click(pay);
    await userEvent.click(pay);
    expect(calls.filter(({ call }) => call === "Afform.submit")).toHaveLength(0);
    expect(
      vi.mocked(window.CRM.api4).mock.calls.filter(([, action]) => action === "submit"),
    ).toEqual([
      [
        "Afform",
        "submit",
        expect.objectContaining({
          values: {
            Contribution1: [
              {
                fields: {
                  checkout_option: "wallet",
                  source: "Wallet page",
                  checkout_params: { source_type: "wallet" },
                },
                joins: {},
              },
            ],
            extra: { fields: {} },
          },
        }),
      ],
    ]);
  });

  // deviation:prefill-without-overlay
  it("keeps a template's own button off while the prefill runs, as afForm's overlay does", async () => {
    window.CRM.vars = { afreact: { afCheckout: islandSettings() } };
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const records = [{ name: "Contribution1", values: [{ fields: {}, joins: {} }] }];
    renderForm(
      [block()],
      { checkout_option: "wallet" },
      {},
      {
        "Afform.prefill": () => held.then(() => records),
      },
    );
    const pay = await screen.findByRole("button", { name: "Pay with wallet" });
    expect(pay).toBeDisabled();
    expect(screen.getByText("invalid")).toBeInTheDocument();
    release?.();
    await waitFor(() => {
      expect(pay).toBeEnabled();
    });
    expect(screen.getByText("valid")).toBeInTheDocument();
  });

  // deviation:checkout-island-per-option
  it("boots a fresh island with empty details when the option changes", async () => {
    window.CRM.vars = { afreact: { afCheckout: islandSettings() } };
    const calls = renderForm([choice, block()], undefined, { checkout_option: "card" });
    await userEvent.type(await screen.findByRole("textbox", { name: "Card Number" }), "4111");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Payment" }), "Wallet");
    expect(destroyed).toEqual([{ template: "card", inForm: true }]);
    expect(screen.queryByRole("textbox", { name: "Card Number" })).not.toBeInTheDocument();
    expect(document.querySelectorAll("[ng-include]")).toHaveLength(1);
    const pay = await screen.findByRole("button", { name: "Pay with wallet" });
    expect(fake.bundleUrls).toHaveLength(2);
    await userEvent.click(pay);
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Contribution1: [
          {
            fields: { checkout_option: "wallet", checkout_params: { source_type: "wallet" } },
            joins: {},
          },
        ],
        extra: { fields: {} },
      });
    });
    // The island goes down before React removes the form around it.
    cleanup();
    expect(destroyed).toEqual([
      { template: "card", inForm: true },
      { template: "wallet", inForm: true },
    ]);
  });

  // deviation:closed-form-locked
  it("disables the template's controls with the form, as React's own checkout fields", async () => {
    window.CRM.vars = { afreact: { afCheckout: islandSettings() } };
    renderForm([block()], { checkout_option: "card" });
    const number = await screen.findByRole("textbox", { name: "Card Number" });
    await userEvent.type(number, "4111");
    vi.mocked(window.CRM.api4).mockImplementationOnce(
      () =>
        new Promise(() => {
          // Never answers.
        }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Save card" })).toBeDisabled();
    });
    expect(number).toBeDisabled();
  });

  it("holds the submit until the template's island is up", async () => {
    const later = islandSettings(["/later.js"], ["afreactLater"]);
    // The label as the server gives it, on the island and not in the option's settings.
    later.checkoutOptions = { card: { ...later.checkoutOptions.card, label: undefined } };
    window.CRM.vars = { afreact: { afCheckout: later } };
    const calls = renderForm([field("source", { label: "Source" }), block()], {
      checkout_option: "card",
    });
    const button = await screen.findByRole("button", { name: "Submit" });
    const script = await waitFor(() => scriptFor("/later.js"));
    // Typing renders the form again, which keeps the hold.
    await userEvent.type(screen.getByRole("textbox", { name: "Source" }), "Web");
    expect(button).toBeDisabled();
    expect(document.querySelector(".afreact-status")).toHaveTextContent("Loading Card…");
    fake.define("afreactLater");
    script.dispatchEvent(new Event("load"));
    await userEvent.type(await screen.findByRole("textbox", { name: "Card Number" }), "4111");
    expect(button).toBeEnabled();
    expect(document.querySelector(".afreact-status")).toHaveTextContent(/^$/);
    await userEvent.click(button);
    await waitFor(() => {
      expect(submitted(calls)).toBeDefined();
    });
  });

  it("keeps the submit held when the template's modules do not load", async () => {
    window.CRM.vars = {
      afreact: { afCheckout: islandSettings(["/gone.js"], ["afreactGone"]) },
    };
    const calls = renderForm([block()], { checkout_option: "card" });
    const button = await screen.findByRole("button", { name: "Submit" });
    await waitFor(() => {
      scriptFor("/gone.js").dispatchEvent(new Event("error"));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Card could not load");
    expect(button).toBeDisabled();
    expect(document.querySelector(".afreact-status")).toHaveTextContent(
      "Card could not load, so the form cannot be submitted.",
    );
    expect(submitted(calls)).toBeUndefined();
  });

  it("releases the submit when the option is left while its modules load", async () => {
    window.CRM.vars = { afreact: { afCheckout: islandSettings(["/stuck.js"], ["afreactStuck"]) } };
    renderForm([choice, block()], undefined, { checkout_option: "card" });
    await waitFor(() => scriptFor("/stuck.js"));
    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).toBeDisabled();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Payment" }), "Pay later");
    expect(button).toBeEnabled();
    expect(document.querySelector(".afreact-status")).toHaveTextContent(/^$/);
  });

  it("boots no island for an option left while its modules load", async () => {
    const slow = islandSettings(["/slow.js"], ["afreactSlow"]);
    window.CRM.vars = { afreact: { afCheckout: slow } };
    renderForm([choice, block()], undefined, { checkout_option: "card" });
    const script = await waitFor(() => scriptFor("/slow.js"));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Payment" }), "Pay later");
    fake.define("afreactSlow");
    script.dispatchEvent(new Event("load"));
    // The page's one load of these assets, which the island waited on first.
    if (!slow.islands) throw new Error("The settings list no islands.");
    await loadAngular(slow.islands.assets);
    expect(fake.bundleUrls).toEqual([]);
    expect(document.querySelector("[ng-include]")).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("No payment will be taken now.")).toBeInTheDocument();
  });

  it("names the option whose modules did not load", async () => {
    window.CRM.vars = {
      afreact: { afCheckout: islandSettings(["/broken.js"], ["afreactBroken"]) },
    };
    renderForm([block()], { checkout_option: "card" });
    await waitFor(() => {
      scriptFor("/broken.js").dispatchEvent(new Event("error"));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Card could not load: Could not load /broken.js.",
    );
    expect(screen.queryByRole("textbox", { name: "Card Number" })).not.toBeInTheDocument();
  });

  it("names the option whose template did not load", async () => {
    window.CRM.vars = { afreact: { afCheckout: islandSettings() } };
    renderForm([block()], { checkout_option: "missing" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Missing could not load: The template ~/afreactTest/missing.html did not load.",
    );
  });
});
