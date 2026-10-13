import { act } from "@testing-library/react";

/** jsdom lays nothing out, so no size changes: a test reports one with resized(). */
const observers = new Set<TestResizeObserver>();

class TestResizeObserver {
  readonly #callback: ResizeObserverCallback;
  readonly #targets = new Set<Element>();
  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    observers.add(this);
  }
  observe(target: Element) {
    this.#targets.add(target);
  }
  unobserve(target: Element) {
    this.#targets.delete(target);
  }
  disconnect() {
    this.#targets.clear();
    observers.delete(this);
  }
  report(target: Element) {
    if (this.#targets.has(target)) this.#callback([], this);
  }
}

export function installResizeObserver() {
  Object.defineProperty(globalThis, "ResizeObserver", {
    value: TestResizeObserver,
    writable: true,
  });
}

/** Reports a new size of `target` to the observers watching it. */
export function resized(target: Element) {
  act(() => {
    for (const observer of [...observers]) observer.report(target);
  });
}
