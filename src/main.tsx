import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { queryClient } from "./api/query";
import { AfreactForm } from "./afform/AfreactForm";
import { layoutSource } from "./afform/source";
import { comparedPages, AfreactCompare } from "./compare/AfreactCompare";
import { AfreactSearch } from "./search/AfreactSearch";
import "./afreact.css";

/** Light-DOM custom element, so CiviCRM's theme styles the React output like any other markup. */
abstract class ReactElement extends HTMLElement {
  private root: Root | null = null;

  connectedCallback() {
    this.root = createRoot(this);
    this.root.render(<QueryClientProvider client={queryClient}>{this.view()}</QueryClientProvider>);
  }

  disconnectedCallback() {
    this.root?.unmount();
    this.root = null;
  }

  protected required(attribute: string): string {
    const value = this.getAttribute(attribute);
    if (!value) throw new Error(`<${this.localName}> needs a ${attribute} attribute`);
    return value;
  }

  protected abstract view(): React.ReactNode;
}

/** <afreact-form name="afformName" source="api|page|bundle"> renders a FormBuilder form. */
class AfreactFormElement extends ReactElement {
  protected view() {
    return (
      <AfreactForm
        name={this.required("name")}
        source={layoutSource(this.getAttribute("source"))}
      />
    );
  }
}

/** <afreact-search search="SavedSearch" display="SearchDisplay"> renders a SearchKit table. */
class AfreactSearchElement extends ReactElement {
  protected view() {
    return <AfreactSearch search={this.required("search")} display={this.required("display")} />;
  }
}

/** <afreact-compare pages='[{"label": "…", "url": "…"}, …]'> measures the listed pages. */
class AfreactCompareElement extends ReactElement {
  protected view() {
    return <AfreactCompare pages={comparedPages(this.required("pages"))} />;
  }
}

customElements.define("afreact-form", AfreactFormElement);
customElements.define("afreact-search", AfreactSearchElement);
customElements.define("afreact-compare", AfreactCompareElement);
