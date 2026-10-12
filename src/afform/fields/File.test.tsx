import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, type Mock } from "vitest";
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
function sent(fetchMock: Mock<typeof fetch>, call = 0) {
  const [url, init] = fetchMock.mock.calls[call] ?? [];
  const body = init?.body;
  if (!(body instanceof globalThis.FormData)) throw new Error("No multipart body was sent.");
  const file = body.get("file");
  const params = body.get("params");
  if (!(file instanceof File) || typeof params !== "string") throw new Error("Fields missing.");
  return { url, headers: init?.headers, params: JSON.parse(params) as unknown, file: file.name };
}

const png = (name = "ada.png") => new File(["x"], name, { type: "image/png" });

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("File fields", () => {
  const draftButton: LayoutNode = {
    "#tag": "button",
    "ng-click": "afform.submitDraft()",
    "#children": [{ "#text": "Save Draft" }],
  };

  it("uploads the chosen file after submit with the token, then shows the stored file", async () => {
    window.history.replaceState(null, "", "/civicrm/form?_aff=page-token");
    let answer = (_: Response) => undefined as void;
    const fetchMock = vi.fn<typeof fetch>(
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
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(respond(200, { values: [] })));
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

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    expect(sent(fetchMock)).toMatchObject({
      headers: { "X-Requested-With": "XMLHttpRequest" },
      params: { joinEntity: "Attachment", entityIndex: 0, joinIndex: 0 },
      file: "scan.pdf",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });

  // deviation:first-join-upload-index
  it("uploads the first join record's file into the draft after submitDraft, with index 0", async () => {
    const draftSaved = () =>
      vi
        .mocked(window.CRM.api4)
        .mock.calls.some(([entity, action]) => entity === "Afform" && action === "submitDraft");
    const order: boolean[] = [];
    const fetchMock = vi.fn<typeof fetch>(() => {
      order.push(draftSaved());
      return Promise.resolve(respond(200, { values: [stored] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const scan = { ...imageField, defn: { ...image, label: "Scan" } };
    renderForm(
      form([{ "#tag": "div", "af-join": "Attachment", "#children": [scan] }, draftButton]),
      undefined,
      [],
      { "Afform.submitDraft": () => [{}] },
    );
    await userEvent.upload(await screen.findByLabelText("Scan"), png());
    await userEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await screen.findByRole("link", { name: "ada.png" });
    expect(order).toEqual([true]);
    expect(sent(fetchMock).params).toEqual({
      name: "afformFiles",
      modelName: "Individual1",
      fieldName: "image",
      joinEntity: "Attachment",
      entityIndex: 0,
      joinIndex: 0,
    });
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
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(respond(200, { values: [] })));
    vi.stubGlobal("fetch", fetchMock);
    renderForm([
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          { "#tag": "af-entity", type: "Contact", name: "Individual1" },
          {
            "#tag": "div",
            "af-fieldset": "Individual1",
            "af-repeat": "Add",
            "#children": [imageField],
          },
          submitButton,
        ],
      },
    ]);
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    await userEvent.upload(screen.getAllByLabelText("Image")[1]!, png("second.png"));
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    expect(sent(fetchMock)).toMatchObject({ params: { entityIndex: 0 }, file: "second.png" });
  });

  // deviation:failed-upload-retry
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
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(respond(200, { values: [stored] })),
    );
    vi.stubGlobal("fetch", fetchMock);
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

  it("ends the retry without a file that keeps failing, also where the field requires one", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(respond(500, { error_message: "Too large" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const trigger = vi.fn(() => popup);
    const popup = jquerySelection({ length: 1, data: () => "", trigger, dialog: vi.fn() });
    vi.mocked(window.CRM.$).mockReturnValue(popup);
    const calls = renderForm(form([{ ...imageField, defn: { ...image, required: true } }]));
    await userEvent.upload(await screen.findByLabelText(/Image/), png());
    // jsdom's validity does not see the chosen file.
    vi.spyOn(HTMLInputElement.prototype, "checkValidity").mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The form is saved");
    expect(screen.getByLabelText(/Image/)).not.toBeRequired();

    await userEvent.click(screen.getByRole("button", { name: "Remove file" }));
    expect(screen.getByLabelText(/Image/)).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(trigger).toHaveBeenCalledWith("crmFormSuccess", expect.anything());
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(calls.filter(({ call }) => call === "Afform.submit")).toHaveLength(1);
  });

  // deviation:draft-join-file-reupload
  it("uploads a draft's file again on submit for a join record the submit creates", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(respond(200, { values: [stored] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const scan = { ...imageField, defn: { ...image, label: "Scan" } };
    renderForm(
      form([{ "#tag": "div", "af-join": "Attachment", "#children": [scan] }, draftButton]),
      undefined,
      [],
      { "Afform.submitDraft": () => [{}] },
    );
    await userEvent.upload(await screen.findByLabelText("Scan"), png());
    await userEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await screen.findByRole("link", { name: "ada.png" });
    expect(sent(fetchMock).params).not.toHaveProperty("token");

    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(sent(fetchMock, 1)).toMatchObject({
      params: { token: "tok", joinEntity: "Attachment", joinIndex: 0 },
      file: "ada.png",
    });
  });

  it("uploads a draft's file on the entity itself only once", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(respond(200, { values: [stored] })),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderForm(form([imageField, draftButton]), undefined, [], {
      "Afform.submitDraft": () => [{}],
    });
    await userEvent.upload(await screen.findByLabelText("Image"), png());
    await userEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await screen.findByRole("link", { name: "ada.png" });
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps a file chosen while the draft uploads the one before it", async () => {
    let answer: (response: Response) => void = () => undefined;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
      )
      .mockResolvedValue(respond(200, { values: [{ ...stored, file_name: "bob.png" }] }));
    vi.stubGlobal("fetch", fetchMock);
    renderForm(form([imageField, draftButton]), undefined, [], {
      "Afform.submitDraft": () => [{}],
    });
    await userEvent.upload(await screen.findByLabelText("Image"), png());
    await userEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    // The submit waits for the draft save.
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    await userEvent.upload(screen.getByLabelText("Image"), png("bob.png"));
    answer(respond(200, { values: [stored] }));

    const draft = await screen.findByRole("button", { name: "Save Draft" });
    await waitFor(() => {
      expect(draft).toBeEnabled();
    });
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: "ada.png" })).not.toBeInTheDocument();
    await userEvent.click(draft);
    expect(await screen.findByRole("link", { name: "bob.png" })).toBeInTheDocument();
    expect(sent(fetchMock, 1)).toMatchObject({ file: "bob.png" });
  });

  it("takes a failed draft's error away once a draft is saved", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respond(500, { error_message: "Timeout" }))
      .mockResolvedValue(respond(200, { values: [stored] }));
    vi.stubGlobal("fetch", fetchMock);
    renderForm(form([imageField, draftButton]), undefined, [], {
      "Afform.submitDraft": () => [{}],
    });
    await userEvent.upload(await screen.findByLabelText("Image"), png());
    await userEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Timeout");
    await userEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await screen.findByRole("link", { name: "ada.png" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("fails loudly when the submit returns no token for a chosen file", async () => {
    const fetchMock = vi.fn<typeof fetch>();
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
    const fetchMock = vi.fn<typeof fetch>();
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

  // deviation:replace-join-file-clears
  // deviation:file-replace-button
  it("shows a prefilled file with a replace button that clears it and moves focus to the input", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const calls = renderForm(form([imageField]), () => [{ token: "tok" }], [
      { name: "Individual1", values: [{ fields: { id: 3, image: stored } }] },
    ]);
    expect(await screen.findByRole("link", { name: "ada.png" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Replace ada.png" }));

    expect(screen.getByLabelText("Image")).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(calls.find(({ call }) => call === "Afform.submit")?.params.values).toEqual({
        Individual1: [{ fields: { id: 3, image: { id: null, file_name: null } }, joins: {} }],
      });
    });
  });

  // deviation:file-replace-button
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
