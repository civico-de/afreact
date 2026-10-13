import { act } from "@testing-library/react";

/**
 * jsdom lays nothing out, so nothing scrolls into view: observed elements stay unseen until a
 * test calls scrollAllIntoView().
 */
const observers = new Set<TestIntersectionObserver>();

class TestIntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [0];
  readonly #callback: IntersectionObserverCallback;
  readonly #targets = new Set<Element>();
  constructor(callback: IntersectionObserverCallback) {
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
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  show() {
    const entries = [...this.#targets].map((target) => ({
      target,
      isIntersecting: true,
      intersectionRatio: 1,
      time: 0,
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRect: target.getBoundingClientRect(),
      rootBounds: null,
    }));
    if (entries.length) this.#callback(entries, this);
  }
}

export function installIntersectionObserver() {
  Object.defineProperty(globalThis, "IntersectionObserver", {
    value: TestIntersectionObserver,
    writable: true,
  });
}

/** Reports every observed element as on show. */
export function scrollAllIntoView() {
  act(() => {
    for (const observer of [...observers]) observer.show();
  });
}
