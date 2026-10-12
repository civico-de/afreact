import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactElement } from "./element";

function Broken(): React.ReactNode {
  throw new Error("No layout.");
}

class BrokenElement extends ReactElement {
  protected view() {
    return <Broken />;
  }
}
customElements.define("afreact-test-broken", BrokenElement);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReactElement", () => {
  it("says a render error happened instead of going blank, and still reports it", async () => {
    const reported = vi.fn<(error: unknown) => void>();
    vi.stubGlobal("reportError", reported);
    const element = document.createElement("afreact-test-broken");
    // Outside act(), which would rethrow the error rather than hand it to the root.
    document.body.append(element);
    await vi.waitFor(() => {
      expect(element.querySelector("[role=alert]")).not.toBeNull();
    });
    expect(element.querySelector("[role=alert]")).toHaveTextContent(
      "This part of the page could not be shown: No layout.",
    );
    expect(reported).toHaveBeenCalledWith(new Error("No layout."));
    element.remove();
  });
});
