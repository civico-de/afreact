import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Field } from "../Field";
import type { FieldDefn } from "../types";

const defn: FieldDefn = {
  name: "details",
  label: "Details",
  input_type: "RichTextEditor",
  data_type: "Text",
  input_style: "big",
};

/** CRM.wysiwyg with an editor per textarea that loads its value when it starts. */
function mockEditor() {
  const content = new Map<Element, string>();
  const started: (() => void)[] = [];
  const wysiwyg = {
    create: vi.fn((item: Element) => ({
      done: (callback: () => void) => {
        started.push(() => {
          if (item instanceof HTMLTextAreaElement) content.set(item, item.value);
          callback();
        });
      },
    })),
    destroy: vi.fn((item: Element) => {
      content.delete(item);
    }),
    getVal: (item: Element) => content.get(item) ?? "",
    setVal: vi.fn((item: Element, value: string) => {
      content.set(item, value);
    }),
  };
  window.CRM.wysiwyg = wysiwyg;
  return {
    wysiwyg,
    content,
    /** Lets the editors started so far finish loading. */
    start: () => {
      act(() => {
        for (const finish of started.splice(0)) finish();
      });
    },
    /** What the editor does when the user types: updates its content, then triggers "change". */
    type: (item: Element, text: string) => {
      content.set(item, text);
      act(() => {
        item.dispatchEvent(new Event("change"));
      });
    },
  };
}

function renderEditor(value: unknown, disabled = false) {
  const onChange = vi.fn<(value: unknown) => void>();
  const view = render(<Field defn={defn} value={value} disabled={disabled} onChange={onChange} />);
  const rerender = (next: unknown, nextDisabled = disabled) => {
    view.rerender(<Field defn={defn} value={next} disabled={nextDisabled} onChange={onChange} />);
  };
  return { onChange, rerender, view };
}

describe("RichTextEditor", () => {
  afterEach(() => {
    delete window.CRM.wysiwyg;
  });

  it("starts the site's editor on the labelled textarea and reports what is typed in it", () => {
    const editor = mockEditor();
    const { onChange } = renderEditor("<p>Old</p>");
    const textarea = screen.getByRole("textbox", { name: "Details" });
    expect(textarea).toHaveClass("big");
    expect(editor.wysiwyg.create).toHaveBeenCalledWith(textarea);
    editor.start();
    expect(editor.content.get(textarea)).toBe("<p>Old</p>");
    editor.type(textarea, "<p>New</p>");
    expect(onChange).toHaveBeenLastCalledWith("<p>New</p>");
  });

  it("reports the editor's HTML without its closing newline and leaves the editor alone", () => {
    const editor = mockEditor();
    const { onChange, rerender } = renderEditor("");
    const textarea = screen.getByRole("textbox", { name: "Details" });
    editor.start();
    editor.wysiwyg.setVal.mockClear();
    editor.type(textarea, "<p>New</p>\n");
    expect(onChange).toHaveBeenLastCalledWith("<p>New</p>");
    rerender("<p>New</p>");
    expect(editor.wysiwyg.setVal).not.toHaveBeenCalled();
  });

  it("sets a value that arrives later into the editor once it has loaded", () => {
    const editor = mockEditor();
    const { rerender } = renderEditor(undefined);
    const textarea = screen.getByRole("textbox", { name: "Details" });
    rerender("<p>Prefilled</p>");
    expect(editor.wysiwyg.setVal).not.toHaveBeenCalled();
    editor.start();
    expect(editor.content.get(textarea)).toBe("<p>Prefilled</p>");
    rerender("<p>Loaded</p>");
    expect(editor.wysiwyg.setVal).toHaveBeenLastCalledWith(textarea, "<p>Loaded</p>");
  });

  // deviation:rich-text-disabled
  it("restarts the editor read-only while the field is disabled and destroys it when removed", () => {
    const editor = mockEditor();
    const { rerender, view } = renderEditor("<p>Text</p>");
    const textarea = screen.getByRole("textbox", { name: "Details" });
    editor.start();
    rerender("<p>Text</p>", true);
    expect(editor.wysiwyg.destroy).toHaveBeenCalledWith(textarea);
    expect(editor.wysiwyg.create).toHaveBeenCalledTimes(2);
    expect(textarea).toBeDisabled();
    view.unmount();
    expect(editor.wysiwyg.destroy).toHaveBeenCalledTimes(2);
  });

  it("ignores change events once the editor is gone", () => {
    const editor = mockEditor();
    const { onChange, view } = renderEditor("");
    const textarea = screen.getByRole("textbox", { name: "Details" });
    editor.start();
    view.unmount();
    editor.type(textarea, "<p>Late</p>");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stays a plain textarea with a visible error when the page lacks CRM.wysiwyg", async () => {
    const { onChange } = renderEditor("");
    expect(screen.getByRole("alert")).toHaveTextContent("rich text editor is not loaded");
    await userEvent.type(screen.getByRole("textbox", { name: "Details" }), "a");
    expect(onChange).toHaveBeenLastCalledWith("a");
  });
});

// deviation:required-rich-text-location
it("keeps a required editor invalid while it is empty", () => {
  mockEditor();
  const { container } = render(
    <Field
      defn={{ ...defn, required: true }}
      value=""
      disabled={false}
      onChange={vi.fn<(value: unknown) => void>()}
    />,
  );
  expect(container.querySelector("textarea")?.validity.valueMissing).toBe(true);
});
