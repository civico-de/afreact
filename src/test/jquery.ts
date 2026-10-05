import type { JQueryObject } from "../api/civi";

/** A jQuery selection for CRM.$ mocks: empty unless `overrides` say otherwise; methods chain. */
export function jquerySelection(overrides: Partial<JQueryObject> = {}): JQueryObject {
  const selection: JQueryObject = {
    length: 0,
    on: () => selection,
    off: () => selection,
    data: () => undefined,
    closest: () => selection,
    trigger: () => selection,
    dialog: () => selection,
    ...overrides,
  };
  return selection;
}

/** An element outside a popup whose jQuery events are DOM events that bubble, as jQuery's do. */
export function events(target: EventTarget): JQueryObject {
  const selection = jquerySelection({
    on: (names, handler) => {
      for (const name of names.split(" ")) target.addEventListener(name, handler);
      return selection;
    },
    off: (names, handler) => {
      for (const name of names.split(" ")) target.removeEventListener(name, handler);
      return selection;
    },
    trigger: (name) => {
      target.dispatchEvent(new Event(name, { bubbles: true }));
      return selection;
    },
  });
  return selection;
}
