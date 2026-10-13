import { vi } from "vitest";

/** jsdom has no Web Animations; tests read the animations started from this mock. */
export const animate = vi.fn<Element["animate"]>();

const mediaList = (media: string, matches: boolean) =>
  Object.assign(new EventTarget(), {
    matches,
    media,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
  });

/** jsdom has no matchMedia; no query matches unless a test asks for reduced motion. */
export function installMotion() {
  Element.prototype.animate = animate;
  window.matchMedia = vi.fn((media: string) => mediaList(media, false));
}

/** The next matchMedia call reports reduced motion. */
export function reduceMotionOnce() {
  vi.mocked(window.matchMedia).mockImplementationOnce((media) => mediaList(media, true));
}
