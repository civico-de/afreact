import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { AfreactForm } from "./AfreactForm";
import { layoutProblems } from "./support";
import type { LayoutNode } from "./types";

const captcha: LayoutNode = {
  "#tag": "crm-recaptcha2",
  recaptchakey: "site-key",
  recaptchatheme: "dark",
};
const layout: LayoutNode[] = [
  {
    "#tag": "af-form",
    ctrl: "afform",
    "#children": [
      captcha,
      { "#tag": "button", "ng-click": "afform.submit()", "#children": [{ "#text": "Submit" }] },
    ],
  },
];

/** A stand-in for Google's API: answers through the callbacks the element registers. */
function fakeGrecaptcha() {
  const widgets: {
    sitekey: string;
    theme: string;
    callback: (r: string) => void;
    expired: () => void;
  }[] = [];
  const reset = vi.fn<(widget: number) => void>();
  window.grecaptcha = {
    ready: (callback) => {
      callback();
    },
    render: (_container, options) => {
      widgets.push({ ...options, expired: options["expired-callback"] });
      return widgets.length - 1;
    },
    reset,
  };
  return { widgets, reset };
}

function renderCaptcha(submit: () => unknown) {
  const calls = mockApi({
    "Afreact.getForm": () => [
      { name: "afformTest", title: "Test", type: "form", layout, strings: [] },
    ],
    "Afform.prefill": () => [],
    "Afform.submit": submit,
  });
  renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash: "" }} />);
  return calls;
}

const submitted = (calls: { call: string; params: Record<string, unknown> }[]) =>
  calls.filter(({ call }) => call === "Afform.submit").map(({ params }) => params.values);

afterEach(() => {
  delete window.grecaptcha;
});

describe("crm-recaptcha2", () => {
  // deviation:captcha-response-both-keys
  it("renders the widget with the form's key and sends its response for both validators", async () => {
    const { widgets } = fakeGrecaptcha();
    const calls = renderCaptcha(() => [{}]);
    const submit = await screen.findByRole("button", { name: "Submit" });
    await waitFor(() => {
      expect(widgets).toHaveLength(1);
    });
    expect(widgets[0]).toMatchObject({ sitekey: "site-key", theme: "dark" });
    widgets[0]?.callback("token-1");
    await userEvent.click(submit);
    await waitFor(() => {
      expect(submitted(calls)).toEqual([
        { extra: { recaptcha2: "token-1", recaptcha: "token-1", fields: {} } },
      ]);
    });
  });

  // deviation:recaptcha-response-once
  it("sends nothing once the response expired, and starts over after a failed submission", async () => {
    const { widgets, reset } = fakeGrecaptcha();
    const calls = renderCaptcha(() => {
      throw apiError("Please go back and complete the CAPTCHA at the bottom of this form.");
    });
    const submit = await screen.findByRole("button", { name: "Submit" });
    await waitFor(() => {
      expect(widgets).toHaveLength(1);
    });
    widgets[0]?.callback("token-1");
    widgets[0]?.expired();
    await userEvent.click(submit);
    widgets[0]?.callback("token-2");
    await userEvent.click(submit);
    await waitFor(() => {
      expect(reset).toHaveBeenCalledTimes(2);
    });
    expect(reset).toHaveBeenCalledWith(0);
    await userEvent.click(submit);
    await waitFor(() => {
      expect(submitted(calls)).toHaveLength(3);
    });
    // The used response is void after the failure, as Google answers it only once.
    expect(submitted(calls)).toEqual([
      {},
      { extra: { recaptcha2: "token-2", recaptcha: "token-2", fields: {} } },
      {},
    ]);
  });

  it("is noted outside af-form", () => {
    expect(layoutProblems(layout)).toEqual([]);
    expect(layoutProblems([captcha])).toEqual(["crm-recaptcha2 outside af-form"]);
  });
});
