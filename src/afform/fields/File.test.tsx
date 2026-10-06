import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { jquerySelection } from "../../test/jquery";
import { mockApi, renderWithQuery } from "../../test/render";
import { AfreactForm } from "../AfreactForm";
import type { PrefillItem } from "../model";
import { layoutProblems } from "../support";
import type { FieldDefn, LayoutNode } from "../types";
import { FieldEnvContext } from "./env";
import { FileField } from "./File";

const image: FieldDefn = {
  name: "image",
  label: "Image",
  input_type: "File",
  data_type: "String",
};
const imageField: LayoutNode = { "#tag": "af-field", name: "image", defn: image };
const submitButton: LayoutNode = {
  "#tag": "button",
  "ng-click": "afform.submit()",
  "#children": [{ "#text": "Submit" }],
};

function form(children: LayoutNode[]): LayoutNode[] {
  return [
    {
      "#tag": "af-form",
      ctrl: "afform",
      "#children": [
        { "#tag": "af-entity", type: "Contact", name: "Individual1" },
        { "#tag": "div", "af-fieldset": "Individual1", "#children": children },
        submitButton,
      ],
    },
  ];
}

function renderForm(
  layout: LayoutNode[],
  submit: () => unknown = () => [{ token: "tok" }],
  prefill: PrefillItem[] = [],
  handlers: Record<string, () => unknown> = {},
) {
  const calls = mockApi({
    "Afreact.getForm": () => [
      { name: "afformFiles", title: "Files", type: "form", layout, strings: [] },
    ],
    "Afform.prefill": () => prefill,
    "Afform.submit": submit,
    ...handlers,
  });
  renderWithQuery(<AfreactForm name="afformFiles" location={{ search: "", hash: "" }} />);
  return calls;
}

const stored = { id: 7, file_name: "ada.png", icon: "fa-file-image-o", url: "/file/7" };

function respond(status: number, json: unknown): Response {
  return new Response(JSON.stringify(json), { status });
}

/** The request the uploader sent: its URL, headers and the multipart `params` field. */
function sent(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  const body = init.body as globalThis.FormData;
  const file = body.get("file") as File;
  return {
    url,
    headers: init.headers,
    params: JSON.parse(String(body.get("params"))) as unknown,
    file: file.name,
  };
}

const png = (name = "ada.png") => new File(["x"], name, { type: "image/png" });

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("File fields", () => {
  it("uploads the chosen file after submit with the token, then shows the stored file", async () => {
    window.history.replaceState(null, "", "/civicrm/form?_aff=page-token");
    let answer = (_: Response) => undefined as void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const calls = renderForm(form([imageField]));
    await userEvent.upload(await screen.findByLabelText("Image"), png());
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Uploading ada.png");
    expect(calls.find(({ call }) => call === "Afform.submit")?.params.values).toEqual({
      Individual1: [{ fields: {}, joins: {} }],
    });
    expect(sent(fetchMock)).toEqual({
      url: "/civicrm/ajax/api4/Afform/submitFile",
      headers: { "X-Requested-With": "XMLHttpRequest", "X-Civi-Auth-Afform": "page-token" },
      params: {
        token: "tok",
        name: "afformFiles",
        modelName: "Individual1",
        fieldName: "image",
        joinEntity: null,
        entityIndex: 0,
        joinIndex: null,
      },
      file: "ada.png",
    });
    answer(respond(200, { values: [stored] }));

    expect(await screen.findByRole("link", { name: "ada.png" })).toHaveAttribute("href", "/file/7");
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.queryByLabelText("Image")).not.toBeInTheDocument();
  });

  it("sends the join and the record's position for a file in a join block", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(respond(200, { values: [] })));
    vi.stubGlobal("fetch", fetchMock);
    renderForm(
      form([
        {
          "#tag": "div",
          "af-join": "Attachment",
          "#children": [{ ...imageField, defn: { ...image, label: "Scan" } }],
        },
      ]),
    );
    await userEvent.upload(await screen.findByLabelText("Scan"), png("scan.pdf"));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(sent(fetchMock)).toMatchObject({
      headers: { "X-Requested-With": "XMLHttpRequest" },
      params: { joinEntity: "Attachment", entityIndex: 0, joinIndex: 0 },
      file: "scan.pdf",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });

  it("keeps the form with a visible error when an upload fails, instead of confirming", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(respond(500, { error_message: "File too large" }))),
    );
    renderForm(form([imageField]), () => [{ token: "tok", message: "<p>Thanks</p>" }]);
    await userEvent.upload(await screen.findByLabelText("Image"), png());
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ada.png could not be uploaded: File too large",
    );
    expect(screen.queryByText("Thanks")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Image")).toBeEnabled();
  });

  it("sends the record the field belongs to when the upload starts, after a removed item", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(respond(200, { values: [] })));
    vi.stubGlobal("fetch", fetchMock);
    renderForm([
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          { "#tag": "af-entity", type: "Contact", name: "Individual1" },
          { "#tag": "div", "af-fieldset": "Individual1", "af-repeat": "Add", "#children": [imageField] },
          submitButton,
        ],
      },
    ]);
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    await userEvent.upload(screen.getAllByLabelText("Image")[1]!, png("second.png"));
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(sent(fetchMock)).toMatchObject({ params: { entityIndex: 0 }, file: "second.png" });
  });

  it("after a failed upload keeps the saved records and retries only the file", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(500, { error_message: "Timeout" }))
      .mockResolvedValueOnce(respond(200, { values: [stored] }));
    vi.stubGlobal("fetch", fetchMock);
    const dialog = vi.fn(() => popup);
    const trigger = vi.fn(() => popup);
    const popup = jquerySelection({ length: 1, data: () => "", trigger, dialog });
    vi.mocked(window.CRM.$).mockReturnValue(popup);
    const nick: LayoutNode = {
      "#tag": "af-field",
      name: "nick_name",
      defn: { name: "nick_name", label: "Nick", input_type: "Text", data_type: "String" },
    };
    const calls = renderForm(form([nick, imageField]));
    await userEvent.upload(await screen.findByLabelText("Image"), png());
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("The form is saved, except for these files.");
    expect(summary).toHaveTextContent("ada.png could not be uploaded: Timeout");
    expect(summary).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Nick" })).toBeDisabled();
    expect(screen.getByLabelText("Image")).toBeEnabled();
    expect(trigger).not.toHaveBeenCalledWith("crmFormSuccess", expect.anything());
    expect(dialog).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("link", { name: "ada.png" })).toBeInTheDocument();
    expect(calls.filter(({ call }) => call === "Afform.submit")).toHaveLength(1);
    expect(sent(fetchMock, 1)).toMatchObject({ params: { token: "tok" }, file: "ada.png" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(trigger).toHaveBeenCalledWith("crmFormSuccess", expect.anything());
    expect(dialog).toHaveBeenCalledWith("close");
  });

  it("uploads a chosen file into the draft, without a token, and counts it as a change", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(respond(200, { values: [stored] })));
    vi.stubGlobal("fetch", fetchMock);
    const draftButton: LayoutNode = {
      "#tag": "button",
      "ng-click": "afform.submitDraft()",
      "#children": [{ "#text": "Save Draft" }],
    };
    const calls = renderForm(form([imageField, draftButton]), undefined, [], {
      "Afform.submitDraft": () => [{}],
    });
    const draft = await screen.findByRole("button", { name: "Save Draft" });
    expect(draft).toBeDisabled();
    await userEvent.upload(screen.getByLabelText("Image"), png());
    expect(draft).toBeEnabled();
    await userEvent.click(draft);

    expect(await screen.findByRole("link", { name: "ada.png" })).toBeInTheDocument();
    expect(calls.map(({ call }) => call)).toContain("Afform.submitDraft");
    const { params } = sent(fetchMock);
    expect(params).toEqual({
      name: "afformFiles",
      modelName: "Individual1",
      fieldName: "image",
      joinEntity: null,
      entityIndex: 0,
      joinIndex: null,
    });
  });

  it("fails loudly when the submit returns no token for a chosen file", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderForm(form([imageField]), () => [{}]);
    await userEvent.upload(await screen.findByLabelText("Image"), png());
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Afform.submit returned no token for the files.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a file when the field does, also once a chosen file is removed again", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const calls = renderForm(form([{ ...imageField, defn: { ...image, required: true } }]));
    const input = await screen.findByLabelText(/Image/);
    expect(input).toBeRequired();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please fill all required fields.");
    expect(calls.map(({ call }) => call)).not.toContain("Afform.submit");

    await userEvent.upload(input, png());
    await userEvent.upload(input, []);
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please fill all required fields.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a prefilled file with a replace button that clears it and moves focus to the input", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const calls = renderForm(form([imageField]), () => [{ token: "tok" }], [
      { name: "Individual1", values: [{ fields: { id: 3, image: stored } }] },
    ]);
    expect(await screen.findByRole("link", { name: "ada.png" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Replace ada.png" }));

    expect(screen.getByLabelText("Image")).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(calls.find(({ call }) => call === "Afform.submit")?.params.values).toEqual({
        Individual1: [{ fields: { id: 3, image: { id: null, file_name: null } }, joins: {} }],
      }),
    );
  });

  it("opens the replace button from the keyboard and shows a file without a link", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderForm(form([imageField]), undefined, [
      { name: "Individual1", values: [{ fields: { image: { id: 7, file_name: "ada.png" } } }] },
    ]);
    expect(await screen.findByText("ada.png")).not.toHaveAttribute("href");
    screen.getByRole("button", { name: "Replace ada.png" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByLabelText("Image")).toHaveFocus();
  });

  it("is not offered outside a form, where nothing uploads the file", () => {
    render(
      <FieldEnvContext.Provider
        value={{ formName: "f", modelName: "Activity1", fieldName: "image", values: {} }}
      >
        <FileField
          id="f"
          defn={image}
          value={null}
          onChange={() => undefined}
          disabled={false}
          describedBy={undefined}
        />
      </FieldEnvContext.Provider>,
    );
    expect(screen.getByRole("note")).toHaveTextContent("file upload outside a form (Image)");
    expect(layoutProblems(form([imageField]))).toEqual([]);
  });
});
