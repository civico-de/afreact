import { render, screen } from "@testing-library/react";
import { mockApi, renderWithQuery } from "../../test/render";
import { Field } from "../Field";
import type { FieldDefn } from "../types";
import { FieldEnvContext } from "./env";

function show(defn: Partial<FieldDefn>, value: unknown) {
  const full = { name: "f", label: "F", input_type: "DisplayOnly", data_type: "String", ...defn };
  const env = { formName: "afformTest", modelName: "Individual1", fieldName: "f", values: {} };
  return renderWithQuery(
    <FieldEnvContext.Provider value={env}>
      <Field defn={full} value={value} disabled={false} onChange={() => undefined} />
    </FieldEnvContext.Provider>,
  );
}

const output = () => screen.getByRole("status");

describe("DisplayOnly", () => {
  it("shows option labels in option order and an unknown value as stored", () => {
    const options = [
      { id: 1, label: "Red" },
      { id: 2, label: "Blue" },
    ];
    show({ data_type: "Integer", options }, [2, 1, 9]);
    expect(output()).toHaveTextContent(/^Red, Blue, 9$/);
  });

  it("shows Yes or No for a Boolean and nothing for an empty value", () => {
    const { unmount } = show({ data_type: "Boolean" }, false);
    expect(output()).toHaveTextContent(/^No$/);
    unmount();
    show({ data_type: "Boolean" }, null);
    expect(output()).toBeEmptyDOMElement();
  });

  it("formats dates, with the time for a timestamp", () => {
    const { unmount } = show({ data_type: "Date" }, "2026-10-06");
    expect(output()).toHaveTextContent("2026-10-06 as date");
    unmount();
    show({ data_type: "Timestamp" }, "2026-10-06 14:30:00");
    expect(output()).toHaveTextContent("2026-10-06 14:30:00 as date and time");
  });

  it("names the referenced records by their autocomplete label", async () => {
    const calls = mockApi({
      "Contact.autocomplete": () => [
        { id: 3, label: "Record three" },
        { id: 4, label: "Record four" },
      ],
    });
    show({ data_type: "Integer", fk_entity: "Contact" }, [3, 4]);
    expect(output()).toHaveTextContent("Loading...");
    expect(await screen.findByText("Record three, Record four")).toBe(output());
    expect(calls).toEqual([
      {
        call: "Contact.autocomplete",
        params: expect.objectContaining({
          ids: [3, 4],
          formName: "afform:afformTest",
          fieldName: "Individual1:f",
        }),
      },
    ]);
  });

  it("reports a failed label lookup", async () => {
    mockApi({
      "Contact.autocomplete": () => {
        throw new Error("Lookup failed");
      },
    });
    show({ data_type: "Integer", fk_entity: "Contact" }, 3);
    expect(await screen.findByRole("alert")).toHaveTextContent("Lookup failed");
  });

  it("shows rich text as filtered HTML without tokens", () => {
    show({ display_format: "html" }, '<b>Bold</b> [Individual1.0.id]<img src=x onerror="x()">');
    expect(screen.getByText("Bold").tagName).toBe("B");
    expect(output()).toHaveTextContent("Bold [Individual1.0.id]");
    expect(output().querySelector("img")).not.toHaveAttribute("onerror");
  });

  it("links a URL and a file", () => {
    const { unmount } = show({ display_format: "url" }, "https://example.org/");
    expect(screen.getByRole("link", { name: "https://example.org/" })).toHaveAttribute(
      "href",
      "https://example.org/",
    );
    unmount();
    const file = { id: 7, file_name: "a.pdf", icon: "fa-file-pdf-o", url: "/file/7" };
    const { unmount: gone } = show({ display_format: "file" }, file);
    expect(screen.getByRole("link", { name: "a.pdf" })).toHaveAttribute("href", "/file/7");
    gone();
    render(
      <FieldEnvContext.Provider
        value={{ formName: "f", modelName: "Individual1", fieldName: "f", values: {} }}
      >
        <Field
          defn={{ name: "f", label: "F", input_type: "DisplayOnly", data_type: "String" }}
          value="plain"
          disabled={false}
          onChange={() => undefined}
        />
      </FieldEnvContext.Provider>,
    );
    expect(output()).toHaveTextContent(/^plain$/);
  });
});
