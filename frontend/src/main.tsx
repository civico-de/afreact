import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { queryClient } from "./api/query";
import { FacadeForm } from "./afform/FacadeForm";
import { layoutSource } from "./afform/source";
import { comparedPages, FacadeCompare } from "./compare/FacadeCompare";
import { FacadeSearch } from "./search/FacadeSearch";
import "./facade.css";

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

/** <facade-form name="afformName" source="api|page|bundle"> renders a FormBuilder form. */
class FacadeFormElement extends ReactElement {
  protected view() {
    return (
      <FacadeForm name={this.required("name")} source={layoutSource(this.getAttribute("source"))} />
    );
  }
}

/** <facade-search search="SavedSearch" display="SearchDisplay"> renders a SearchKit table. */
class FacadeSearchElement extends ReactElement {
  protected view() {
    return <FacadeSearch search={this.required("search")} display={this.required("display")} />;
  }
}

/** <facade-compare pages='[{"label": "…", "url": "…"}, …]'> measures the listed pages. */
class FacadeCompareElement extends ReactElement {
  protected view() {
    return <FacadeCompare pages={comparedPages(this.required("pages"))} />;
  }
}

customElements.define("facade-form", FacadeFormElement);
customElements.define("facade-search", FacadeSearchElement);
customElements.define("facade-compare", FacadeCompareElement);
