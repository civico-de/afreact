import { render } from "@testing-library/react";
import { useRef } from "react";
import { usePageHeading } from "./pageHeading";

function Page({ heading }: { heading: string | undefined }) {
  const host = useRef<HTMLDivElement>(null);
  usePageHeading(host, heading);
  return <div ref={host} />;
}

describe("usePageHeading", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.title = "";
  });

  it("follows the heading while mounted and gives the page its own back on unmount", () => {
    document.title = "FormBuilder | CiviCRM";
    document.body.innerHTML = `<h1 id="page">FormBuilder</h1>`;
    const page = document.getElementById("page");
    const view = render(<Page heading={undefined} />);
    expect(page).toHaveTextContent(/^FormBuilder$/);
    view.rerender(<Page heading="Form: Ada" />);
    expect(page).toHaveTextContent("Form: Ada");
    view.rerender(<Page heading="Form: Bea" />);
    expect(page).toHaveTextContent("Form: Bea");
    expect(document.title).toBe("Form: Bea | CiviCRM");
    view.unmount();
    expect(page).toHaveTextContent(/^FormBuilder$/);
    expect(document.title).toBe("FormBuilder | CiviCRM");
  });

  it("takes the page's heading over a heading inside the content, and gives it back when unset", () => {
    document.title = "FormBuilder | CiviCRM";
    document.body.innerHTML =
      '<div class="crm-container"><h1 id="content">Inside</h1></div>' +
      '<div class="crm-page-title-wrapper"><h1 id="page">FormBuilder</h1></div>';
    const view = render(<Page heading="Form: Ada" />);
    expect(document.getElementById("page")).toHaveTextContent("Form: Ada");
    expect(document.getElementById("content")).toHaveTextContent(/^Inside$/);
    view.rerender(<Page heading={undefined} />);
    expect(document.getElementById("page")).toHaveTextContent(/^FormBuilder$/);
    expect(document.title).toBe("FormBuilder | CiviCRM");
  });
});
