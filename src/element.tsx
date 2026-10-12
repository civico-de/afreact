import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import { dropUnobserved, queryClient } from "./api/query";
import { onFirstDebugEntry } from "./debug/debug";
import { mountDebugDock } from "./debug/DebugDock";
import { isOnlyElement, storeFor, UrlState } from "./url/UrlState";

onFirstDebugEntry(mountDebugDock);

/** Light-DOM custom element, so CiviCRM's theme styles the React output like any other markup. */
export abstract class ReactElement extends HTMLElement {
  private root: Root | null = null;

  connectedCallback() {
    this.root = createRoot(this, {
      // React removes the whole tree on a render error; the element says so instead of going blank.
      onUncaughtError: (error) => {
        reportError(error);
        const alert = document.createElement("div");
        alert.className = "messages error no-popup";
        alert.setAttribute("role", "alert");
        alert.textContent = ts("This part of the page could not be shown: %1", {
          1: error instanceof Error ? error.message : String(error),
        });
        this.append(alert);
      },
    });
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
