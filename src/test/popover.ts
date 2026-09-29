/**
 * jsdom lacks the popover API: showPopover/hidePopover with their toggle events and the
 * popovertarget button. Enough of it for the menus; light dismiss is the browser's part.
 */
class TestToggleEvent extends Event {
  readonly oldState: string;
  readonly newState: string;
  constructor(type: string, init: { oldState: string; newState: string }) {
    super(type);
    this.oldState = init.oldState;
    this.newState = init.newState;
  }
}

const open = new WeakSet<HTMLElement>();

function setOpen(element: HTMLElement, next: boolean) {
  if (open.has(element) === next) return;
  if (next) open.add(element);
  else open.delete(element);
  element.dispatchEvent(
    new TestToggleEvent("toggle", {
      oldState: next ? "closed" : "open",
      newState: next ? "open" : "closed",
    }),
  );
}

export function installPopover() {
  Object.defineProperty(globalThis, "ToggleEvent", { value: TestToggleEvent, writable: true });
  HTMLElement.prototype.showPopover = function showPopover(this: HTMLElement) {
    setOpen(this, true);
  };
  HTMLElement.prototype.hidePopover = function hidePopover(this: HTMLElement) {
    setOpen(this, false);
  };
  HTMLElement.prototype.togglePopover = function togglePopover(this: HTMLElement) {
    const next = !open.has(this);
    setOpen(this, next);
    return next;
  };
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const id = target?.closest("button[popovertarget]")?.getAttribute("popovertarget");
    const popover = id ? document.getElementById(id) : null;
    if (popover) popover.togglePopover();
  });
}

export function isPopoverOpen(element: Element): boolean {
  return element instanceof HTMLElement && open.has(element);
}
