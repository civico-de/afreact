import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { dropUnobserved, queryClient } from "./api/query";
import { isOnlyElement, storeFor, UrlState } from "./url/UrlState";

/** Light-DOM custom element, so CiviCRM's theme styles the React output like any other markup. */
export abstract class ReactElement extends HTMLElement {
  private root: Root | null = null;

  connectedCallback() {
    this.root = createRoot(this);
    this.root.render(
      <QueryClientProvider client={queryClient}>
        <UrlState store={storeFor(this)} onlyElement={isOnlyElement(this)}>
          {this.view()}
        </UrlState>
      </QueryClientProvider>,
    );
  }

  disconnectedCallback() {
    this.root?.unmount();
    this.root = null;
    dropUnobserved(queryClient);
  }

  protected required(attribute: string): string {
    const value = this.getAttribute(attribute);
    if (!value) throw new Error(`<${this.localName}> needs a ${attribute} attribute`);
    return value;
  }

  protected abstract view(): React.ReactNode;
}
