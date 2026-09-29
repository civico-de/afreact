import { vi } from "vitest";
import { jquerySelection } from "../test/jquery";
import { announceSaved, popupLocation } from "./popup";

/** A jQuery stand-in for an element in a dialog; crm.ajax.js stores the loaded URL's hash as urlHash. */
function dialogJQuery(urlHash: unknown) {
  const dialog = vi.fn(() => selection);
  const trigger = vi.fn(() => selection);
  const selection = jquerySelection({
    length: 1,
    data: (key) => (key === "urlHash" ? urlHash : undefined),
    trigger,
    dialog,
  });
  vi.mocked(window.CRM.$).mockReturnValue(selection);
  return { dialog, trigger };
}

function inDialog(): Element {
  const content = document.createElement("div");
  content.className = "ui-dialog-content";
  const host = document.createElement("afreact-form");
  content.append(host);
  return host;
}

describe("popupLocation", () => {
  it("is null outside a dialog, so the page URL counts", () => {
    expect(popupLocation(document.createElement("afreact-form"))).toBeNull();
  });

  it("takes the query after ? in the hash of the URL the dialog loaded", () => {
    dialogJQuery("#?contact_id=5&cid=5");
    expect(popupLocation(inDialog())).toEqual({ search: "", hash: "#?contact_id=5&cid=5" });
  });

  it("has no arguments when the dialog URL's hash has no query", () => {
    dialogJQuery("#");
    expect(popupLocation(inDialog())).toEqual({ search: "", hash: "" });
    dialogJQuery(undefined);
    expect(popupLocation(inDialog())).toEqual({ search: "", hash: "" });
  });
});

describe("announceSaved", () => {
  it("triggers crmFormSuccess and closes the dialog", () => {
    const { dialog, trigger } = dialogJQuery("");
    announceSaved(inDialog(), { afform: { name: "a" } }, true);
    expect(trigger).toHaveBeenCalledWith("crmFormSuccess", { afform: { name: "a" } });
    expect(dialog).toHaveBeenCalledWith("close");
  });

  it("keeps the dialog open when a message or redirect follows", () => {
    const { dialog, trigger } = dialogJQuery("");
    announceSaved(inDialog(), {}, false);
    expect(trigger).toHaveBeenCalled();
    expect(dialog).not.toHaveBeenCalled();
  });

  it("closes nothing outside a dialog", () => {
    const outside = jquerySelection({
      trigger: vi.fn(() => outside),
      dialog: vi.fn(() => outside),
    });
    vi.mocked(window.CRM.$).mockReturnValue(outside);
    announceSaved(document.createElement("div"), {}, true);
    expect(outside.trigger).toHaveBeenCalledWith("crmFormSuccess", {});
    expect(outside.dialog).not.toHaveBeenCalled();
  });
});
