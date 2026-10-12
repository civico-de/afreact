import { render, screen } from "@testing-library/react";
import { usePageLoaded } from "./pageLoaded";

function Loaded() {
  return <p>{usePageLoaded() ? "loaded" : "loading"}</p>;
}

/** Finishes the page load while React renders, before any effect has run. */
function LoadsDuringRender() {
  vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
  window.dispatchEvent(new Event("load"));
  return null;
}

describe("usePageLoaded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("notices a load that fires between the first render and the listener", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("interactive");
    render(
      <>
        <Loaded />
        <LoadsDuringRender />
      </>,
    );
    expect(screen.getByText("loaded")).toBeInTheDocument();
  });
});
