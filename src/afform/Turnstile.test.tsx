import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { AfreactForm } from "./AfreactForm";
import { layoutProblems } from "./support";
import type { LayoutNode } from "./types";

const API = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const captcha: LayoutNode = {
  "#tag": "crm-turnstile",
  recaptchakey: "site-key",
  recaptchatheme: "dark",
};
const inForm = (...children: LayoutNode[]): LayoutNode[] => [
  {
    "#tag": "af-form",
    ctrl: "afform",
    "#children": [
      ...children,
      { "#tag": "button", "ng-click": "afform.submit()", "#children": [{ "#text": "Submit" }] },
    ],
  },
];

/** A stand-in for Cloudflare's API: answers through the callbacks the element registers. */
function fakeTurnstile() {
  const widgets: {
    sitekey: string;
    theme: string;
    callback: (r: string) => void;
    expired: () => void;
  }[] = [];
  const reset = vi.fn<(widget: string) => void>();
  const api = {
    render: (
      _container: HTMLElement,
      options: {
        sitekey: string;
        theme: string;
        callback: (r: string) => void;
        "expired-callback": () => void;
      },
    ) => {
      widgets.push({ ...options, expired: options["expired-callback"] });
      return `widget-${widgets.length - 1}`;
    },
    reset,
  };
  return { api, widgets, reset };
}

function renderCaptcha(submit: () => unknown, layout = inForm(captcha)) {
  const calls = mockApi({
    "Afreact.getForm": () => [
      { name: "afformTest", title: "Test", type: "form", layout, strings: [] },
    ],
    "Afform.prefill": () => [],
    "Afform.submit": submit,
  });
  const view = renderWithQuery(
    <AfreactForm name="afformTest" location={{ search: "", hash: "" }} />,
  );
  return { calls, view };
}

const submitted = (calls: { call: string; params: Record<string, unknown> }[]) =>
  calls.filter(({ call }) => call === "Afform.submit").map(({ params }) => params.values);

const scripts = () => [...document.head.querySelectorAll(`script[src="${API}"]`)];

afterEach(() => {
  delete window.turnstile;
  for (const script of scripts()) script.remove();
});

describe("crm-turnstile", () => {
  it("renders the widget with the form's key and sends its response as formprotection reads it", async () => {
    const { api, widgets } = fakeTurnstile();
    window.turnstile = api;
    const { calls } = renderCaptcha(() => [{}]);
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
    expect(scripts()).toEqual([]);
  });

  // deviation:recaptcha-response-once
  it("sends nothing once the response expired, and starts over after a failed submission", async () => {
    const { api, widgets, reset } = fakeTurnstile();
    window.turnstile = api;
    const { calls } = renderCaptcha(() => {
      throw apiError("Error validating form");
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
    expect(reset).toHaveBeenCalledWith("widget-0");
    await userEvent.click(submit);
    await waitFor(() => {
      expect(submitted(calls)).toHaveLength(3);
    });
    expect(submitted(calls)).toEqual([
      { extra: { fields: {} } },
      { extra: { recaptcha2: "token-2", recaptcha: "token-2", fields: {} } },
      { extra: { fields: {} } },
    ]);
  });

  // deviation:captcha-without-key-noted
  it("shows a note instead of the widget where no extension wrote a site key", async () => {
    const { api, widgets } = fakeTurnstile();
    window.turnstile = api;
    const keyless = inForm({ "#tag": "crm-turnstile" });
    renderCaptcha(() => [{}], keyless);
    const note = "Turnstile without a site key, which the formprotection extension adds";
    expect(await screen.findByRole("note")).toHaveTextContent(note);
    expect(widgets).toEqual([]);
    expect(layoutProblems(keyless)).toEqual([note]);
  });

  it("is noted outside af-form", () => {
    expect(layoutProblems(inForm(captcha))).toEqual([]);
    expect(layoutProblems([captcha])).toEqual(["crm-turnstile outside af-form"]);
  });

  it("loads Cloudflare's script once per page, and again after it failed to load", async () => {
    const twice = inForm(captcha, { "#tag": "crm-turnstile", recaptchakey: "site-key" });
    // A script that does not arrive, and one that arrives without the API.
    for (const failure of [fireEvent.error, fireEvent.load]) {
      const failed = renderCaptcha(() => [{}], twice);
      await waitFor(() => {
        expect(scripts()).toHaveLength(1);
      });
      for (const script of scripts()) failure(script);
      expect(await screen.findAllByRole("alert")).toHaveLength(2);
      expect(screen.getAllByRole("alert")[0]).toHaveTextContent(`Could not load ${API}.`);
      failed.view.unmount();
      for (const script of scripts()) script.remove();
    }

    const { api, widgets } = fakeTurnstile();
    renderCaptcha(() => [{}], twice);
    await waitFor(() => {
      expect(scripts()).toHaveLength(1);
    });
    window.turnstile = api;
    for (const script of scripts()) fireEvent.load(script);
    await waitFor(() => {
      expect(widgets.map(({ theme }) => theme)).toEqual(["dark", "light"]);
    });
  });
});
