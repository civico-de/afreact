import { describe, expect, it } from "vitest";
import { crmAlert } from "./html";
import { onCiviScreen } from "./test/notifications";

// deviation:alert-text-escaped
describe("crmAlert", () => {
  it("escapes text and title for a notification, which takes HTML", () => {
    onCiviScreen();
    crmAlert("<b>Ada</b>", "<i>Saved</i>", "success");
    expect(window.CRM.alert).toHaveBeenCalledWith(
      "&lt;b&gt;Ada&lt;/b&gt;",
      "&lt;i&gt;Saved&lt;/i&gt;",
      "success",
    );
  });

  it("passes plain text to the fallback dialog, which shows text", () => {
    crmAlert("<b>Ada</b>", "<i>Saved</i>");
    expect(window.CRM.alert).toHaveBeenCalledWith("<b>Ada</b>", "<i>Saved</i>", undefined);
  });
});
